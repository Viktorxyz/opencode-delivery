/**
 * Run reducer + deterministic controller entry.
 *
 * Single source of truth for the workflow state machine. The
 * reducer is pure: every transition takes the current state
 * and an event, returns the next state and any side ledger
 * entry. The controller wraps the reducer with the I/O that
 * inverts the ledger back into the Git common directory.
 *
 * Transitions:
 *   created     -> running
 *   running     -> running (task dispatched)
 *   running     -> commit-pending (review passes)
 *   running     -> fix-pending (review fails; round++)
 *   running     -> revision-required (3 consecutive failures)
 *   running     -> blocked (unrecoverable infrastructure failure)
 *   commit-pending -> committed (controller commits and writes ledgers)
 *   committed   -> running (next task dispatched)
 *   running     -> all-tasks-done
 *   all-tasks-done -> ready-pending (final review)
 *   ready-pending -> ready (parallel Standards/Spec + verification)
 *   ready       -> merged (separate explicit merge)
 *   merged      -> done
 *
 * Invariant: at most one task is active at any time. The
 * reducer refuses to advance from "running" with a different
 * task id than the one already recorded.
 */

import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveGitCommonDir, opencodeShipStateDir } from "../state/git-common-dir.js";
import { publishImmutableJson, withResourceLock } from "../state/durable-store.js";

const STATES = Object.freeze({
  CREATED: "created",
  RUNNING: "running",
  COMMIT_PENDING: "commit-pending",
  COMMITTED: "committed",
  FIX_PENDING: "fix-pending",
  REVISION_REQUIRED: "revision-required",
  BLOCKED: "blocked",
  ALL_TASKS_DONE: "all-tasks-done",
  READY_PENDING: "ready-pending",
  READY: "ready",
  MERGED: "merged",
  DONE: "done",
});

const EVENT_KINDS = Object.freeze({
  RUN_START: "run-start",
  TASK_DISPATCH: "task-dispatch",
  TASK_REPORT: "task-report",
  TASK_REVIEW: "task-review",
  COMMIT: "commit",
  TASK_COMPLETE: "task-complete",
  FINAL_REVIEW: "final-review",
  READY: "ready",
  MERGE: "merge",
  BLOCKED: "blocked",
});

const MAX_FIX_ROUNDS = 3;

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalize(value) {
  const seen = new WeakSet();
  const sort = (v) => {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v)) return null;
    seen.add(v);
    if (Array.isArray(v)) return v.map(sort);
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sort(v[k]);
    return out;
  };
  return JSON.stringify(sort(value));
}

function nextRound(failures) {
  return (failures ?? 0) + 1;
}

function nextSequence(events) {
  return events.length + 1;
}

function appendEvent(state, recorded) {
  return [...state.events, recorded];
}

function ensureActiveTask(state, taskId) {
  if (state.activeTask === null) return;
  if (state.activeTask !== taskId) {
    throw new Error(`run reducer: another task is active (${state.activeTask}), refusing ${taskId}`);
  }
}

/**
 * Pure reducer. Returns the next state and the event to
 * append to the immutable ledger. Never throws on a valid
 * transition; the controller catches out-of-order calls.
 *
 * @param {object} state
 * @param {object} event
 * @returns {{ state: object, event: object }}
 */
export function reduce(state, event) {
  const ev = { ...event, at: event.at ?? new Date().toISOString() };
  const sequence = nextSequence(state.events);
  const recorded = (kind, data) => ({ sequence, kind, at: ev.at, data });
  const nextState = (extra) => ({ ...state, ...extra, events: appendEvent(state, recorded(event.kind, event.data)) });
  switch (event.kind) {
    case EVENT_KINDS.RUN_START: {
      if (state.state !== STATES.CREATED) {
        throw new Error(`run reducer: RUN_START requires state=created, got ${state.state}`);
      }
      return {
        state: nextState({ state: STATES.RUNNING, activeTask: null, round: 0, completedTasks: [] }),
        event: recorded(EVENT_KINDS.RUN_START, { revision: event.data.revision, sha256: event.data.sha256 }),
      };
    }
    case EVENT_KINDS.TASK_DISPATCH: {
      if (state.state !== STATES.RUNNING && state.state !== STATES.FIX_PENDING) {
        throw new Error(`run reducer: TASK_DISPATCH requires state=running|fix-pending, got ${state.state}`);
      }
      if (state.activeTask !== null) {
        throw new Error(`run reducer: TASK_DISPATCH while another task is active (${state.activeTask})`);
      }
      return {
        state: nextState({ state: STATES.RUNNING, activeTask: event.data.taskId, round: 1 }),
        event: recorded(EVENT_KINDS.TASK_DISPATCH, { taskId: event.data.taskId, briefHash: event.data.briefHash }),
      };
    }
    case EVENT_KINDS.TASK_REVIEW: {
      if ((state.state !== STATES.RUNNING && state.state !== STATES.FIX_PENDING) || state.activeTask === null) {
        throw new Error(`run reducer: TASK_REVIEW requires running with active task`);
      }
      ensureActiveTask(state, event.data.taskId);
      const failures = event.data.verdict === "pass" ? 0 : nextRound(state.failures);
      const next = state.round + 1;
      if (event.data.verdict === "pass") {
        return {
          state: nextState({ state: STATES.COMMIT_PENDING, round: state.round, taskReady: { taskId: event.data.taskId, reviewHash: event.data.reviewHash } }),
          event: recorded(EVENT_KINDS.TASK_REVIEW, { taskId: event.data.taskId, verdict: "pass", reviewHash: event.data.reviewHash }),
        };
      }
      if (failures >= MAX_FIX_ROUNDS) {
        return {
          state: nextState({ state: STATES.REVISION_REQUIRED, failures, round: next, activeTask: null }),
          event: recorded(EVENT_KINDS.TASK_REVIEW, { taskId: event.data.taskId, verdict: "fail", failures }),
        };
      }
      return {
        state: nextState({ state: STATES.FIX_PENDING, failures, round: next, activeTask: null }),
        event: recorded(EVENT_KINDS.TASK_REVIEW, { taskId: event.data.taskId, verdict: "fail", round: next, failures }),
      };
    }
    case EVENT_KINDS.COMMIT: {
      if (state.state !== STATES.COMMIT_PENDING) {
        throw new Error(`run reducer: COMMIT requires state=commit-pending, got ${state.state}`);
      }
      return {
        state: nextState({ state: STATES.COMMITTED, activeTask: null, round: 0, failures: 0, completedTasks: [...state.completedTasks, state.taskReady?.taskId].filter(Boolean) }),
        event: recorded(EVENT_KINDS.COMMIT, { taskId: state.taskReady?.taskId, commitSha: event.data.commitSha }),
      };
    }
    case EVENT_KINDS.TASK_COMPLETE: {
      if (state.state !== STATES.COMMITTED) {
        throw new Error(`run reducer: TASK_COMPLETE requires state=committed, got ${state.state}`);
      }
      return {
        state: nextState({ state: STATES.RUNNING, activeTask: null, taskReady: null, round: 0, failures: 0 }),
        event: recorded(EVENT_KINDS.TASK_COMPLETE, { taskId: event.data.taskId }),
      };
    }
    case EVENT_KINDS.READY: {
      if (state.state !== STATES.COMMITTED && state.state !== STATES.READY_PENDING) {
        throw new Error(`run reducer: READY requires state=committed|ready-pending, got ${state.state}`);
      }
      return {
        state: nextState({ state: STATES.READY, activeTask: null, completedTasks: state.completedTasks }),
        event: recorded(EVENT_KINDS.READY, { headSha: event.data.headSha }),
      };
    }
    case EVENT_KINDS.MERGE: {
      if (state.state !== STATES.READY) {
        throw new Error(`run reducer: MERGE requires state=ready, got ${state.state}`);
      }
      return {
        state: nextState({ state: STATES.MERGED, mergedAt: ev.at, mergeSha: event.data.mergeSha }),
        event: recorded(EVENT_KINDS.MERGE, { mergeSha: event.data.mergeSha }),
      };
    }
    case EVENT_KINDS.BLOCKED: {
      return {
        state: nextState({ state: STATES.BLOCKED, blockedReason: event.data.reason }),
        event: recorded(EVENT_KINDS.BLOCKED, { reason: event.data.reason }),
      };
    }
    default:
      throw new Error(`run reducer: unknown event kind ${event.kind}`);
  }
}

export function createInitialState(workflowId, revision, sha256) {
  return {
    workflowId,
    revision,
    sha256,
    state: STATES.CREATED,
    activeTask: null,
    taskReady: null,
    round: 0,
    failures: 0,
    completedTasks: [],
    events: [],
  };
}

export const RUN_STATES = STATES;
export const RUN_EVENT_KINDS = EVENT_KINDS;
export const RUN_MAX_FIX_ROUNDS = MAX_FIX_ROUNDS;

async function runDir(repoRoot, workflowId) {
  const common = await resolveGitCommonDir(repoRoot);
  return join(opencodeShipStateDir(common), "runs", workflowId);
}

function readTaskId(baseHead, planHash) {
  return sha256(`${planHash}:${baseHead}`).slice(0, 16);
}

/**
 * Append a single event to the immutable ledger and update
 * the run.json snapshot. The reducer is run inside a per-run
 * lock so concurrent controller invocations cannot interleave.
 *
 * @param {string} repoRoot
 * @param {string} workflowId
 * @param {object} state
 * @param {object} event
 * @returns {Promise<{ state: object, event: object }>}
 */
export async function appendRunEvent(repoRoot, workflowId, state, event) {
  const common = await resolveGitCommonDir(repoRoot);
  const dir = join(opencodeShipStateDir(common), "runs", workflowId, "events");
  await mkdir(dir, { recursive: true });
  const lockKey = `run:${workflowId}`;
  return withResourceLock(opencodeShipStateDir(common), lockKey, async () => {
    const { state: next, event: recorded } = reduce(state, event);
    const sequence = String(recorded.sequence).padStart(8, "0");
    const path = join(dir, `${sequence}.json`);
    await publishImmutableJson(path, recorded);
    const runPath = join(opencodeShipStateDir(common), "runs", workflowId, "run.json");
    const snapshot = {
      workflowId,
      revision: next.revision,
      sha256: next.sha256,
      state: next.state,
      activeTask: next.activeTask,
      failures: next.failures,
      round: next.round,
      completedTasks: next.completedTasks,
      lastEvent: recorded,
      updatedAt: new Date().toISOString(),
    };
    await writeFile(runPath, JSON.stringify(snapshot, null, 2), "utf8");
    return { state: next, event: recorded };
  });
}

/**
 * Read the run state for a workflow. The snapshot is the
 * latest run.json; the events list is reconstructed from the
 * `events/` directory.
 *
 * @param {string} repoRoot
 * @param {string} workflowId
 * @returns {Promise<object | null>}
 */
export async function readRunState(repoRoot, workflowId) {
  const dir = await runDir(repoRoot, workflowId);
  const runPath = join(dir, "run.json");
  if (!existsSync(runPath)) return null;
  const snapshot = JSON.parse(await readFile(runPath, "utf8"));
  const eventsDir = join(dir, "events");
  const events = existsSync(eventsDir)
    ? await Promise.all(
        (await readdir(eventsDir))
          .filter((n) => n.endsWith(".json"))
          .sort()
          .map(async (n) => JSON.parse(await readFile(join(eventsDir, n), "utf8")))
      )
    : [];
  return {
    workflowId,
    revision: snapshot.revision,
    sha256: snapshot.sha256,
    state: snapshot.state,
    activeTask: snapshot.activeTask,
    failures: snapshot.failures,
    round: snapshot.round,
    completedTasks: snapshot.completedTasks,
    events,
  };
}

export function buildCommitTrailers({ workflowId, planHash, taskId, round, reviewHash }) {
  return [
    `Opencode-Ship-Workflow: ${workflowId}`,
    `Opencode-Ship-Plan: ${planHash}`,
    `Opencode-Ship-Task: ${taskId}`,
    `Opencode-Ship-Review: ${reviewHash ?? "n/a"}`,
    `Opencode-Ship-Round: ${round}`,
  ];
}

export { readTaskId };