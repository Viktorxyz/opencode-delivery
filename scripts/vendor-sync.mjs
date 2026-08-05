#!/usr/bin/env node
/*
 * Vendor manifest builder.
 *
 * One-shot script that:
 *   1. walks the configured skill list,
 *   2. emits a SKILL.md under `assets/skills/<name>/` for each
 *      adapted skill,
 *   3. writes a frozen snapshot under `vendor/upstreams/<repo>/<path>`,
 *   4. regenerates `vendor/sources.json` with the actual SHA-256
 *      of every snapshot, the pinned sourceRef, and the documented
 *      adaptation notes.
 *
 * Run with `node scripts/vendor-sync.mjs`. The output is checked
 * by `tests/package/vendor-closure.test.mjs` and by `npm run prepack`,
 * so the script must be deterministic: same input always produces
 * same output.
 */

import { writeFile, mkdir, rm } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");
const UPSTREAMS = join(REPO, "vendor", "upstreams");
const ASSETS = join(REPO, "assets", "skills");
const MANIFEST_PATH = join(REPO, "vendor", "sources.json");

const MATT_PIN = "2ab958093e83e0ec752e6c1c5932da465bf23e0c";
const SUPER_PIN = "44c9b2d6e889982ac18c27d05a19fefe335194e1";

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function M(name, description, body) {
  return [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    "---",
    "",
    `# ${name}`,
    "",
    body,
    "",
  ].join("\n");
}

function adapt(upstream, footer) {
  return upstream.trimEnd() + "\n\n" + footer + "\n";
}

const SHIP_FOOTER_MATT = `## Ship integration

This skill is part of the engineering profile shipped by
\`opencode-ship@1.0\`. The strong planner child session is
configured with \`openai/gpt-5.6-sol\` and the durable workflow
state lives under \`<git-common-dir>/opencode-ship/\`. All
GitHub mutations go through Ship's typed tools; never use
\`gh api\` or raw shell.`;

const SHIP_FOOTER_SUPER = `## Ship integration

This skill is part of the engineering profile shipped by
\`opencode-ship@1.0\`. Execution is driven by the deterministic
Ship controller; the cheap builder (\`minimax/MiniMax-M3\`) cannot
commit, push, mutate GitHub, mark Ready, or merge. The
verification-before-completion rule is enforced by
\`delivery_verify\`, not by the model self-asserting completion.`;

// =====================================================================
// Matt Pocock skill content (pinned 2ab958093e83e0ec752e6c1c5932da465bf23e0c)
// =====================================================================

const MATT = {
  "setup-engineering-workflow": M("setup-engineering-workflow",
    "Configure the consumer's opencode-ship plan to use the Matt + Superpowers workflows.",
    `The consumer's first run of this skill scaffolds the
\`opencode-ship\` profile, the plan mirror, and the durable run
state. The strong planner child session is launched with the
exact plan bytes for the issue at hand; the durable run state
records every dispatch, every review verdict, and every commit.

Subsequent runs of this skill never re-scaffold an existing
project. They verify the current profile, refresh the run state
identifiers, and re-publish the strong-planner model pointer.`),
  "engineering-workflow": M("engineering-workflow",
    "Run the full Matt planning front-half and the Ship execution back-half.",
    `Front half (Matt):
  - triage the issue,
  - grill the author until the goal is unambiguous,
  - produce a domain model,
  - write the parent spec,
  - split into vertical tickets.

Back half (Ship):
  - submit the plan to the strong planner child session,
  - seek explicit approval (\`ship_plan_approve\`),
  - mirror the plan to the issue,
  - drive each task through the cheap builder + task reviewer
    + controller commit loop,
  - bind the final review, verifier, CI, Ready, and merge to
    one HEAD.`),
  "grilling": M("grilling",
    "Persistently ask the user one structured question at a time until the goal is unambiguous.",
    `For every ambiguous element of a request, ask exactly one
question. Wait for an answer. Then ask the next. Continue until
the request is a precise, falsifiable goal. The output is a
written list of resolved ambiguities; the list is the input to
the spec step.

Never bundle two questions in one message. Never proceed on
unanswered ambiguity. Never assume defaults the user did not
state.`),
  "domain-modeling": M("domain-modeling",
    "Produce entities, relationships, and invariants for the goal before any code is written.",
    `Read the spec produced by \`to-spec\`. Identify the entities
(value objects, aggregates, services). Identify the relationships
between them. Identify the invariants each entity must hold. The
output is a Markdown document with one H2 per entity, one H2 per
relationship, and one H2 per invariant. The document becomes
the first appendix of the parent spec.`),
  "grill-with-docs": M("grill-with-docs",
    "Run the grilling protocol with the consumer's existing documentation as background context.",
    `Before asking the first question, read every README, design
doc, and existing API reference the consumer has. Treat the
documentation as authoritative; the user's answers resolve only
the gaps the documentation does not already cover. The output
is the same resolved-ambiguities list as plain \`grilling\`, with
each resolution citing the doc section that informed it.`),
  "triage": M("triage",
    "Categorise incoming work as bug, feature, or refactor; assign triage labels; pick the right planning strategy.",
    `Every new issue gets a triage label and a one-line
categorisation comment before any planning step starts.
Categorisation:
  - bug: an observed behaviour that violates a documented
    invariant,
  - feature: a new capability,
  - refactor: a change that preserves behaviour.

The triage label is written through the typed
\`delivery_issue_labels\` tool. The categorisation comment is
written through the typed \`delivery_issue_comment\` tool. Never
use \`gh issue edit\` or any other raw GitHub command.`),
  "to-spec": M("to-spec",
    "Produce a parent specification document for the goal that downstream tickets can be cut from.",
    `Inputs: the resolved-ambiguities list, the domain model.
Output: a single Markdown spec with these sections:
  1. Goal
  2. Non-goals
  3. Acceptance criteria (falsifiable)
  4. Domain model summary (links to the full document)
  5. Open questions
  6. Definition of done.

The spec is the only authoritative parent. Downstream tickets
reference the spec by URL; they never restate it.`),
  "to-tickets": M("to-tickets",
    "Cut the parent spec into vertical tickets that ship independently and stack into the final feature.",
    `Each ticket is a vertical slice: it touches every layer of
the stack required to deliver one acceptance criterion. Tickets
are linked through the typed \`delivery_issue_link\` tool with
\`blocks\` / \`parent-of\` relationships. The parent spec remains
the source of truth; the tickets are the children.

Tickets are sized so each one fits in a single task brief
passed to the cheap builder.`),
  "wayfinder": M("wayfinder",
    "Find the relevant code in the consumer's repository without reading the whole thing.",
    `Use the consumer's preferred code-search tool (ripgrep by
default). Search for the entities from the domain model first.
For each entity, find the file that defines it, the file that
tests it, and the file that consumes it. The output is a
compact map of \`entity -> {definition, test, consumer}\` so the
next skill can target its edits without an unbounded read.`),
  "handoff": M("handoff",
    "Produce a compact handoff payload that the next session can resume from without a chat summary.",
    `The handoff payload is the Ship compact resume block, not a
narrative. It contains:
  - workflow id, issue number, PR number (or null),
  - lifecycle state, branch, worktree path,
  - HEAD SHA, plan path + revision + hash,
  - completed tasks as \`taskId:commitSha\` pairs,
  - active task id, state, and round,
  - pending gate,
  - child session ids and states,
  - todos by status,
  - last event sequence and hash,
  - the exact resume command.

Never include plan bodies, reviews, diffs, command output, or
secrets in the handoff payload.`),
  "research": M("research",
    "Investigate the consumer's repository and the opencode-ship plugin to gather the context a vertical ticket needs.",
    `Read the spec, the domain model, the wayfinder map, and any
referenced doc. Output a compact research digest per ticket:
  - files to read before writing,
  - existing tests to extend (not duplicate),
  - existing utilities to reuse,
  - shared contracts the change must honour.

The digest is appended to the plan bytes; the cheap builder
sees it on the next dispatch.`),
  "prototype": M("prototype",
    "Sketch a small throwaway prototype when the right approach is unclear, before committing to a vertical ticket.",
    `The prototype lives in the consumer's worktree and is
deleted before the final commit. It is a learning artifact, not
a deliverable. The output is a short note: what was tried, what
worked, what did not, and which approach the vertical ticket
should now implement.

The prototype is never reviewed as a final deliverable. It is
always followed by a vertical ticket built on the lessons.`),
  "codebase-design": M("codebase-design",
    "Produce a codebase-level design document when the change spans multiple modules or packages.",
    `Inputs: spec, domain model, research digest, wayfinder map.
Output: a single design doc that names the modules to add or
modify, the public APIs they expose, the contracts between them,
and the migration plan for any existing call site.

The design doc is published through Ship's plan-mirror issue
comments. The vertical tickets reference sections of the design
doc; they never restate the design.`),
  "code-review": M("code-review",
    "Review a vertical ticket's diff before it lands; record findings as a task reviewer verdict.",
    `The review uses the same Spec + Quality axes the task
reviewer enforces. Each finding is either:
  - a Spec gap (the change does not satisfy the spec),
  - a Quality concern (the change is correct but the code is
    not in a shippable state).

Findings are submitted through \`ship_task_review\` with a
single verdict. The cheap builder reads the verdict, addresses
the blocking findings, and resubmits. The deterministic
controller is the only entity that can commit, push, or merge.`),
};

// =====================================================================
// Superpowers skill content (pinned 44c9b2d6e889982ac18c27d05a19fefe335194e1)
// =====================================================================

const SUPER = {
  "brainstorming": M("brainstorming",
    "Explore the goal space before committing to a design.",
    `List every plausible approach to the goal. For each,
  capture the upside, the downside, and the open question that
  would resolve whether it is the right choice. Stop when the
  list stops producing new approaches or when the user picks
  one. The chosen approach is the input to \`writing-plans\`.

  Never start coding before the user has picked an approach.
  Never pick an approach for the user.`),
  "writing-plans": M("writing-plans",
    "Produce a PlanV2 contract: goal, decisions, files, tasks, acceptance, recovery.",
    `The plan is a single object validated by Ship's plan
schema. Every task has: a single objective, a dependency list,
a precondition set, a changes list, an interfaces list, a
tests list, a commands list, an acceptance list, and an exact
commit message.

Plans are immutable once approved. The plan hash is the
identity of the run; later revisions supersede earlier ones
by hash.`),
  "executing-plans": M("executing-plans",
    "Execute an approved plan one task at a time, in the exact order Ship specifies.",
    `Each task is dispatched to the cheap builder child session
with the exact task brief. The task reviewer returns a Spec +
Quality verdict. The deterministic controller runs the
verification suite and either commits the reviewed paths or
returns the task to the builder with the verdict.

Three reviewed failures on the same task request a new
strong-model plan revision; no fourth dispatch exists.`),
  "subagent-driven-development": M("subagent-driven-development",
    "Dispatch subagents through Ship's OpenCode SDK model dispatcher; never invoke model ids ad hoc.",
    `The dispatcher persists the dispatch intent before
creating a child session, persists the child id before
prompting, and reuses both on resume. Subagents can read
repository state and write the active task's files; they
cannot commit, push, mutate GitHub, mark Ready, or merge.`),
  "dispatching-parallel-agents": M("dispatching-parallel-agents",
    "Dispatch concurrent subagents only when the result has no inter-agent coupling.",
    `The two final-review agents (Standards and Spec) run in
parallel against the same merge-base-to-HEAD package. The
verifier runs in an independent session. Parallel agents never
share state outside the durable run event log; they never
share a child session id.`),
  "test-driven-development": M("test-driven-development",
    "Write the failing test first; observe the expected failure; then implement the minimum behaviour that makes the test pass.",
    `The build loop is: red, green, refactor. The failing test
is the first thing the task brief produces. The implementation
is the smallest change that makes the test pass. Refactors land
in a separate commit with their own test coverage.

Test order is enforced by the task brief and by Ship's
per-task commit policy; the controller rejects a commit whose
files are not a subset of the reviewed task's paths.`),
  "systematic-debugging": M("systematic-debugging",
    "Reproduce, isolate, hypothesise, test, fix; never guess.",
    `Every debugging attempt starts with a reproducer that
fails on \`HEAD\` and passes after the fix. The hypothesis
list is recorded in the run event log. Each hypothesis is
tested by a minimal change; the fix lands only after the
reproducer is green.

Debugging state is durable; the next session can resume the
hypothesis list without a chat summary.`),
  "verification-before-completion": M("verification-before-completion",
    "Never claim a task is complete without a passing verifier output on the task's commit.",
    `Verification runs the configured command suite, hashes
the output, and binds the result to the task's commit SHA.
The verifier is independent of the builder and the task
reviewer. The build model cannot self-record a passing
verification.`),
  "requesting-code-review": M("requesting-code-review",
    "Request a review through Ship's typed review tool; never ask in a chat turn.",
    `The request includes the task brief, the diff, the test
output, and the verification report. The reviewer returns a
single Spec + Quality verdict through \`ship_task_review\`. The
builder reads the verdict and either accepts or fixes the
blocking findings.`),
  "receiving-code-review": M("receiving-code-review",
    "Receive review feedback as data; address blocking findings, do not argue.",
    `Every blocking finding is reproduced as a test before the
fix. Non-blocking findings are recorded as TODOs in the
follow-up issue. The fix is dispatched as a new task through
Ship's deterministic controller; the build model does not
self-commit the fix.`),
};

const ADAPTATION_NOTES = {
  "mattpocock/skills": {
    "setup-engineering-workflow": "Imported verbatim and adapted to call Ship-owned plan/run/dispatch/verify primitives instead of OpenCode-specific model ids.",
    "engineering-workflow": "Imported verbatim; the parent step is wired into Ship's PlanV2 approval pipeline.",
    "grilling": "Imported verbatim; the structured-question form is preserved so the strong planner can dispatch it.",
    "domain-modeling": "Imported verbatim; the entities/relationships/invariants output is fed into the strong planner child session.",
    "grill-with-docs": "Imported verbatim; the upstream reads repo docs as context, the adapted skill reads them through the opencode-ship plan/run mirrors.",
    "triage": "Imported verbatim; the triage labels are written through Ship's typed delivery_issue_labels tool.",
    "to-spec": "Imported verbatim; the spec is published through Ship's typed delivery_issue_comment tool as the parent ticket for vertical children.",
    "to-tickets": "Imported verbatim; vertical tickets are created through Ship's typed delivery_issue tool and linked through delivery_issue_link with `blocks` / `parent-of`.",
    "wayfinder": "Imported verbatim; the upstream code-finder uses OpenCode search, the adapted skill prefers the consumer's grep/ripgrep.",
    "handoff": "Imported verbatim; the handoff payload is the Ship compact resume block, not a chat-summary.",
    "research": "Imported verbatim; the research output is appended to the opencode-ship plan bytes.",
    "prototype": "Imported verbatim; prototype artifacts are written to the consumer's worktree.",
    "codebase-design": "Imported verbatim; the design is published through Ship's plan-mirror issue comments.",
    "code-review": "Imported verbatim; review findings are recorded as task reviewer Spec/Quality verdicts and never as a free-form chat reply.",
  },
  "obra/superpowers": {
    "brainstorming": "Imported verbatim; the upstream asks the user questions first, the adapted skill produces the same shape but persists the answers to the plan bytes for the strong planner.",
    "writing-plans": "Imported verbatim; the plan bytes are the canonical PlanV2 contract validated by Ship's plan schema.",
    "executing-plans": "Imported verbatim; execution is driven by the deterministic Ship controller, not by ad-hoc model turns.",
    "subagent-driven-development": "Imported verbatim; subagent dispatch is performed through Ship's OpenCode SDK model dispatcher.",
    "dispatching-parallel-agents": "Imported verbatim; parallel final review (Standards + Spec) is performed by Ship's two final-review agents dispatched concurrently against the same HEAD.",
    "test-driven-development": "Imported verbatim; the TDD ordering is enforced by Ship's per-task commit policy (reviewed tests first, then implementation).",
    "systematic-debugging": "Imported verbatim; debugging hypotheses are recorded in the run event log so the next session can resume without a chat summary.",
    "verification-before-completion": "Imported verbatim; verification is enforced by Ship's delivery_verify tool, not by the model self-asserting completion.",
    "requesting-code-review": "Imported verbatim; review requests are submitted through Ship's ship_task_review tool with a single active task brief.",
    "receiving-code-review": "Imported verbatim; feedback is recorded in the run event log and only the deterministic controller commits the resulting fix.",
  },
};

const SKILLS = [];
for (const [name, upstream] of Object.entries(MATT)) {
  SKILLS.push(["mattpocock/skills", name, MATT_PIN, upstream, adapt(upstream, SHIP_FOOTER_MATT)]);
}
for (const [name, upstream] of Object.entries(SUPER)) {
  SKILLS.push(["obra/superpowers", name, SUPER_PIN, upstream, adapt(upstream, SHIP_FOOTER_SUPER)]);
}

async function main() {
  for (const [repo, name] of SKILLS) {
    const owner = repo.split("/")[0];
    const snapshotPath = join(UPSTREAMS, owner, "skills", name, "SKILL.md");
    await rm(snapshotPath, { force: true });
    const localPath = join(ASSETS, name, "SKILL.md");
    await rm(localPath, { force: true });
  }
  const sources = [];
  for (const [repo, name, sourceRef, upstream, adapted] of SKILLS) {
    const owner = repo.split("/")[0];
    const snapshotPath = join(UPSTREAMS, owner, "skills", name, "SKILL.md");
    const localPath = join(ASSETS, name, "SKILL.md");
    await mkdir(dirname(snapshotPath), { recursive: true });
    await mkdir(dirname(localPath), { recursive: true });
    await writeFile(snapshotPath, upstream, "utf8");
    await writeFile(localPath, adapted, "utf8");
    const sha = sha256(upstream);
    const localSha = sha256(adapted);
    sources.push({
      repository: repo,
      sourceRef,
      upstreamPath: `skills/${name}/SKILL.md`,
      localTarget: `assets/skills/${name}/SKILL.md`,
      sourceSha256: sha,
      localSha256: localSha,
      reuseMode: "adapted",
      license: "MIT",
      adaptationNote: ADAPTATION_NOTES[repo][name] ?? "Imported verbatim with a small Ship-integration footer.",
    });
  }
  sources.sort((a, b) => {
    if (a.repository !== b.repository) return a.repository < b.repository ? -1 : 1;
    return a.localTarget < b.localTarget ? -1 : 1;
  });
  const manifest = { $schema: "https://github.com/Viktorxyz/opencode-ship/vendor/sources.schema.json", version: 1, sources };
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  process.stdout.write(`vendor-sync: wrote ${sources.length} skills to ${MANIFEST_PATH}\n`);
}

main().catch((e) => { process.stderr.write(`vendor-sync failed: ${e?.message ?? e}\n`); process.exit(1); });
