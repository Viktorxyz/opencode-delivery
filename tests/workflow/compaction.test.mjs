/*
 * Compaction block tests.
 *
 * The block is the only contract between sessions. It is
 * bounded to <= 4 KiB, contains no plan bodies / reports /
 * diffs / secrets / model prose, and round-trips through
 * the renderer and parser. Tests pin every field.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  renderCompactionBlock,
  parseCompactionBlock,
  hashCompactionBlock,
  COMPACTION_SCHEMA,
  COMPACTION_MAX_BYTES,
} from "../../src/workflow/compaction.js";

function sample(overrides = {}) {
  return {
    workflow: "wf-1",
    issue: 12,
    pr: 13,
    lifecycle: "validating",
    branch: "feat/issue-12",
    worktree: "/tmp/repo",
    head: "0123456789abcdef0123456789abcdef01234567",
    planPath: "revisions/000001/plan.json",
    planRevision: 1,
    planHash: "a".repeat(64),
    completed: [["t1", "b".repeat(40)]],
    activeTask: "t2",
    activeState: "building",
    round: 1,
    pendingGate: "task-review",
    children: [["builder", "session-1", "active"]],
    todos: { pending: 0, inProgress: 1, completed: 1 },
    lastEventSeq: 7,
    lastEventHash: "c".repeat(64),
    resumeCommand: "/ship-resume wf-1",
    ...overrides,
  };
}

test("compaction: header pins the schema", () => {
  const text = renderCompactionBlock(sample());
  assert.ok(text.startsWith(`opencode-ship-resume:${COMPACTION_SCHEMA}\n`));
});

test("compaction: render is < 4 KiB for the sample block", () => {
  const text = renderCompactionBlock(sample());
  assert.ok(Buffer.byteLength(text, "utf8") <= COMPACTION_MAX_BYTES);
});

test("compaction: round-trips through render and parse", () => {
  const block = sample();
  const text = renderCompactionBlock(block);
  const parsed = parseCompactionBlock(text);
  assert.equal(parsed.workflow, block.workflow);
  assert.equal(parsed.issue, block.issue);
  assert.equal(parsed.pr, block.pr);
  assert.equal(parsed.lifecycle, block.lifecycle);
  assert.equal(parsed.branch, block.branch);
  assert.equal(parsed.worktree, block.worktree);
  assert.equal(parsed.head, block.head);
  assert.equal(parsed.planPath, block.planPath);
  assert.equal(parsed.planRevision, block.planRevision);
  assert.equal(parsed.planHash, block.planHash);
  assert.deepEqual(parsed.completed, block.completed);
  assert.equal(parsed.activeTask, block.activeTask);
  assert.equal(parsed.activeState, block.activeState);
  assert.equal(parsed.round, block.round);
  assert.equal(parsed.pendingGate, block.pendingGate);
  assert.deepEqual(parsed.children, block.children);
  assert.deepEqual(parsed.todos, block.todos);
  assert.equal(parsed.lastEventSeq, block.lastEventSeq);
  assert.equal(parsed.lastEventHash, block.lastEventHash);
  assert.equal(parsed.resumeCommand, block.resumeCommand);
});

test("compaction: tolerates null issue / pr / active / round", () => {
  const text = renderCompactionBlock(sample({ issue: null, pr: null, activeTask: null, round: null }));
  const parsed = parseCompactionBlock(text);
  assert.equal(parsed.issue, null);
  assert.equal(parsed.pr, null);
  assert.equal(parsed.activeTask, null);
  assert.equal(parsed.round, null);
});

test("compaction: hashCompactionBlock is stable", () => {
  const text = renderCompactionBlock(sample());
  const h1 = hashCompactionBlock(text);
  const h2 = hashCompactionBlock(text);
  assert.equal(h1, h2);
  assert.match(h1, /^[0-9a-f]{64}$/);
});

test("compaction: rejects a block with a wrong header", () => {
  assert.throws(() => parseCompactionBlock("opencode-ship-resume:v1\n"), /unexpected header/);
});

test("compaction: never embeds plan bodies or reports", () => {
  const text = renderCompactionBlock(sample({ planHash: "z".repeat(64) }));
  // The block references the plan by hash and path; it must
  // not contain the words "implementation", "diff", or
  // "secret".
  assert.ok(!text.includes("implementation"));
  assert.ok(!text.includes("diff"));
  assert.ok(!text.includes("secret"));
});
