import { test, suite } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

import { resolveGitCommonDir, opencodeShipStateDir } from "../../src/state/git-common-dir.js";

async function makeRepo({ bare = false } = {}) {
  const dir = await mkdtemp(resolve(tmpdir(), "ocd-gcd-"));
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "test",
    GIT_AUTHOR_EMAIL: "test@local",
    GIT_COMMITTER_NAME: "test",
    GIT_COMMITTER_EMAIL: "test@local",
  };
  const args = bare ? ["init", "--bare", "-b", "main"] : ["init", "-b", "main"];
  spawnSync("git", args, { cwd: dir, env });
  if (!bare) {
    spawnSync("git", ["config", "user.email", "test@local"], { cwd: dir });
    spawnSync("git", ["config", "user.name", "test"], { cwd: dir });
    await writeFile(join(dir, "README.md"), "# test\n");
    spawnSync("git", ["add", "README.md"], { cwd: dir, env });
    spawnSync("git", ["commit", "-m", "init"], { cwd: dir, env });
  }
  return dir;
}

suite("git-common-dir resolver", { concurrency: false }, () => {
  test("returns the absolute common dir for a main checkout", { serial: true }, async () => {
    const repo = await makeRepo();
    const common = await resolveGitCommonDir(repo);
    assert.ok(common);
    assert.ok(common.startsWith("/"), "expected absolute path");
    assert.ok(common.endsWith(".git"), `expected common dir to end with .git, got ${common}`);
    await rm(repo, { recursive: true, force: true });
  });

  test("returns the same common dir from a linked worktree", { serial: true }, async () => {
    const repo = await makeRepo();
    const worktreePath = resolve(repo, "..", "ocd-wt-" + Date.now());
    const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@local", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@local" };
    const r = spawnSync("git", ["worktree", "add", "-b", "feat/test", worktreePath], { cwd: repo, env });
    assert.equal(r.status, 0, `git worktree add failed: ${r.stderr?.toString()}`);
    const main = await resolveGitCommonDir(repo);
    const wt = await resolveGitCommonDir(worktreePath);
    assert.equal(main, wt, "main and worktree must share one common dir");
    await rm(repo, { recursive: true, force: true });
    await rm(worktreePath, { recursive: true, force: true });
  });

  test("returns the absolute common dir for a bare repository", { serial: true }, async () => {
    const repo = await makeRepo({ bare: true });
    const common = await resolveGitCommonDir(repo);
    assert.ok(common);
    assert.ok(common.startsWith("/"));
    assert.ok(common.includes("ocd-gcd-"), `expected bare common dir under tmp, got ${common}`);
    await rm(repo, { recursive: true, force: true });
  });

  test("throws when the directory is not a Git repository", { serial: true }, async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "ocd-empty-"));
    await assert.rejects(() => resolveGitCommonDir(dir), /git-common-dir/);
    await rm(dir, { recursive: true, force: true });
  });

  test("opencodeShipStateDir is anchored under the common dir", { serial: true }, async () => {
    const repo = await makeRepo();
    const common = await resolveGitCommonDir(repo);
    const stateDir = opencodeShipStateDir(common);
    assert.ok(stateDir.startsWith(common), `state dir must live under common, got ${stateDir}`);
    assert.ok(stateDir.includes("opencode-ship"));
    await rm(repo, { recursive: true, force: true });
  });
});
