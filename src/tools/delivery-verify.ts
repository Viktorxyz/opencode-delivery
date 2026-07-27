/**
 * delivery_verify tool.
 *
 * Runs the project-owned canonical verification command, records the
 * HEAD SHA, and updates the manifest. Each invocation is an atomic
 * subprocess; the parent agent never sees a partial state.
 */

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import * as git from "../drivers/git.ts";
import {  Adapter  } from "../adapter.ts";
import { readManifest, writeManifest } from "../state/manifest-store.ts";
import { transition } from "../state/lifecycle.js";

export const VerifyDeps = {
  repoRoot: string;
  adapter: Adapter;
};

export const VerifyInput = {
  taskId: string;
  commandId: string;
};

export const VerifyOutput = {
  contractVersion: 1;
  commandId: string;
  status: number;
  stdoutTail: string;
  stderrTail: string;
  headSha: string;
  manifestPath: string;
};

export function createVerifyTool(deps) {
  return async function verify(input: VerifyInput){
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
    const proc = spawn(cmd.argv[0]!, [...cmd.argv.slice(1)], {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutChunks= [];
    const stderrChunks= [];
    proc.stdout.on("data", (d) => stdoutChunks.push(d.toString()));
    proc.stderr.on("data", (d) => stderrChunks.push(d.toString()));
    const status= await new Promise((res, rej) => {
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
        await writeManifest(deps.repoRoot, { ...m, lastVerifierSha, state, transitionLog: [...m.transitionLog, { from, to, at, reason: t.reason }], updatedAt: new Date().toISOString() });
      }
    }
    return {
      contractVersion: 1,
      commandId,
      headSha,
      manifestPath: resolve(deps.repoRoot, ".opencode", "delivery.json"),
    };
  };
}
