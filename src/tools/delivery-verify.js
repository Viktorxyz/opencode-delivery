/**
 * delivery_verify tool.
 *
 * Runs the project-owned canonical verification command, records the
 * HEAD SHA, and updates the manifest. Each invocation is an atomic
 * subprocess; the parent agent never sees a partial state.
 */

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import * as git from "../drivers/git.js";
import { readManifest, writeManifest } from "../state/manifest-store.js";
import { transition } from "../state/lifecycle.js";

export function createVerifyTool(deps) {
  return async function verify(input) {
    const m = await readManifest(deps.repoRoot, input.taskId);
    if (!m) return null;
    if (!m.worktreePath) return null;
    const commands = deps.adapter.verification?.commands ?? [];
    if (commands.length === 0) return null;
    const cmd = input.commandId
      ? commands.find((c) => c.id === input.commandId)
      : commands[0];
    if (!cmd) return null;
    const worktreePath = m.worktreePath;
    const head = git.currentHead(worktreePath);
    if (!head) return null;
    const proc = spawn(cmd.argv[0], cmd.argv.slice(1), {
      cwd: worktreePath,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    proc.stdout.on("data", (d) => stdoutChunks.push(d.toString()));
    proc.stderr.on("data", (d) => stderrChunks.push(d.toString()));
    const status = await new Promise((res, rej) => {
      proc.on("error", rej);
      proc.on("close", (code) => res(code ?? -1));
    });
    const stdout = stdoutChunks.join("");
    const stderr = stderrChunks.join("");
    const stdoutTail = stdout.slice(-2000);
    const stderrTail = stderr.slice(-2000);
    if (status === 0) {
      const t = transition({ ...m, lastVerifierSha: head }, "validating", { reason: `verify ok (${cmd.id})` });
      if (t.ok) {
        const next = {
          ...m,
          lastVerifierSha: head,
          state: t.to,
          transitionLog: [...m.transitionLog, { from: t.from, to: t.to, at: t.at, reason: t.reason }],
          updatedAt: new Date().toISOString(),
        };
        await writeManifest(deps.repoRoot, next);
      }
    }
    return {
      contractVersion: 1,
      commandId: cmd.id,
      status,
      stdoutTail,
      stderrTail,
      headSha: head,
      manifestPath: resolve(deps.repoRoot, ".opencode", "delivery.json"),
    };
  };
}
