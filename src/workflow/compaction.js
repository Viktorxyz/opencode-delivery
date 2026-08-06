/**
 * Compaction block.
 *
 * A bounded (<= 4 KiB), pointer-only snapshot of the durable
 * workflow state that survives chat compaction. The block
 * never includes plan bodies, reviewer reports, diffs,
 * command output, secrets, or prior model prose; it only
 * references them by hash and pointer.
 *
 * Format (UTF-8 text, line-oriented):
 *
 *   opencode-ship-resume:v2
 *   workflow=<id>
 *   issue=<n> pr=<n|null>
 *   lifecycle=<state>
 *   branch=<branch> worktree=<path>
 *   head=<sha>
 *   plan=<path>#revision=<n>#sha256=<hash>
 *   completed=<taskId:commitSha,...>
 *   active=<taskId|null> state=<state> round=<n|null>
 *   pending-gate=<gate>
 *   children=<role:sessionID:state,...>
 *   todos=<pending>/<in-progress>/<completed>
 *   last-event=<seq>:<hash>
 *   resume=/ship-resume <workflowId>
 *
 * The format is a stable contract; tests pin every field.
 */

import { createHash } from "node:crypto";

const SCHEMA = "v2";
const MAX_BYTES = 4096;

/**
 * @typedef {Object} CompactionBlock
 * @property {string} workflow
 * @property {number | null} issue
 * @property {number | null} pr
 * @property {string} lifecycle
 * @property {string} branch
 * @property {string} worktree
 * @property {string} head
 * @property {string} planPath
 * @property {number} planRevision
 * @property {string} planHash
 * @property {Array<[string, string]>} completed
 * @property {string | null} activeTask
 * @property {string} activeState
 * @property {number | null} round
 * @property {string} pendingGate
 * @property {Array<[string, string, string]>} children
 * @property {{ pending: number, inProgress: number, completed: number }} todos
 * @property {number} lastEventSeq
 * @property {string} lastEventHash
 * @property {string} resumeCommand
 */

/**
 * @param {CompactionBlock} block
 * @returns {string}
 */
export function renderCompactionBlock(block) {
  const lines = [
    `opencode-ship-resume:${SCHEMA}`,
    `workflow=${block.workflow}`,
    `issue=${block.issue ?? "null"}`,
    `pr=${block.pr ?? "null"}`,
    `lifecycle=${block.lifecycle}`,
    `branch=${block.branch}`,
    `worktree=${block.worktree}`,
    `head=${block.head}`,
    `plan=${block.planPath}#revision=${block.planRevision}#sha256=${block.planHash}`,
    `completed=${block.completed.map(([id, sha]) => `${id}:${sha}`).join(",")}`,
    `active=${block.activeTask ?? "null"} state=${block.activeState} round=${block.round ?? "null"}`,
    `pending-gate=${block.pendingGate}`,
    `children=${block.children.map(([role, id, state]) => `${role}:${id}:${state}`).join(",")}`,
    `todos=${block.todos.pending}/${block.todos.inProgress}/${block.todos.completed}`,
    `last-event=${block.lastEventSeq}:${block.lastEventHash}`,
    `resume=${block.resumeCommand}`,
  ];
  void lines;
  const text = lines.join("\n") + "\n";
  if (Buffer.byteLength(text, "utf8") > MAX_BYTES) {
    throw new Error(`compaction block exceeds ${MAX_BYTES} bytes (${Buffer.byteLength(text, "utf8")})`);
  }
  return text;
}

/**
 * @param {string} text
 * @returns {Partial<CompactionBlock>}
 */
export function parseCompactionBlock(text) {
  const lines = text.split("\n");
  if (lines[0] !== `opencode-ship-resume:${SCHEMA}`) {
    throw new Error(`parseCompactionBlock: unexpected header: ${lines[0]}`);
  }
  /** @type {Partial<CompactionBlock>} */
  const out = {};
  for (const line of lines.slice(1)) {
    if (line.length === 0) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq);
    const value = line.slice(eq + 1);
    switch (key) {
      case "workflow": out.workflow = value; break;
      case "issue": {
        out.issue = value === "null" ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
        break;
      }
      case "pr": {
        out.pr = value === "null" ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
        break;
      }
      case "lifecycle": out.lifecycle = value; break;
      case "branch": out.branch = value; break;
      case "worktree": out.worktree = value; break;
      case "head": out.head = value; break;
      case "plan": {
        const m = value.match(/^(.+)#revision=(\d+)#sha256=([0-9a-f]{64})$/);
        if (m) {
          out.planPath = m[1];
          out.planRevision = Number(m[2]);
          out.planHash = m[3];
        }
        break;
      }
      case "completed": {
        out.completed = value.split(",").filter(Boolean).map((p) => {
          const [id, sha] = p.split(":");
          return [id, sha];
        });
        break;
      }
      case "active": {
        const m = value.match(/^(\S+) state=(\S+) round=(\S+)$/);
        if (m) {
          out.activeTask = m[1] === "null" ? null : m[1];
          out.activeState = m[2];
          out.round = m[3] === "null" ? null : (Number.isFinite(Number(m[3])) ? Number(m[3]) : null);
        }
        break;
      }
      case "pending-gate": out.pendingGate = value; break;
      case "children": {
        out.children = value.split(",").filter(Boolean).map((p) => {
          const [role, id, state] = p.split(":");
          return [role, id, state];
        });
        break;
      }
      case "todos": {
        const [p, ip, c] = value.split("/").map(Number);
        out.todos = { pending: p, inProgress: ip, completed: c };
        break;
      }
      case "last-event": {
        const [seq, hash] = value.split(":");
        out.lastEventSeq = Number(seq);
        out.lastEventHash = hash;
        break;
      }
      case "resume": out.resumeCommand = value; break;
    }
  }
  return out;
}

/**
 * @param {string} text
 * @returns {string} hex SHA-256 of the canonical bytes.
 */
export function hashCompactionBlock(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export const COMPACTION_SCHEMA = SCHEMA;
export const COMPACTION_MAX_BYTES = MAX_BYTES;
