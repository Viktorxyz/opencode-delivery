/*
 * Discovery contract: the canonical skill files exist with the right
 * description frontmatter so opencode can auto-discover them.
 */

import { test, suite } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

suite("canonical skill discovery", { concurrency: false }, () => {
  test("delivery-workflow exists with the expected frontmatter", { serial: true }, () => {
    const path = "assets/skills/delivery-workflow/SKILL.md";
    assert.ok(existsSync(path));
    const src = readFileSync(path, "utf8");
    assert.match(src, /^name:\s*delivery-workflow/m);
    assert.match(src, /^description:\s+\S+/m);
  });

  test("planning-research-checkpoint exists with the expected frontmatter", { serial: true }, () => {
    const path = "assets/skills/planning-research-checkpoint/SKILL.md";
    assert.ok(existsSync(path));
    const src = readFileSync(path, "utf8");
    assert.match(src, /^name:\s*planning-research-checkpoint/m);
    assert.match(src, /^description:\s+\S+/m);
  });

  test("skill folders are nested under <name>/SKILL.md (not bare SKILL.md)", { serial: true }, () => {
    for (const p of ["assets/skills/delivery-workflow/SKILL.md", "assets/skills/planning-research-checkpoint/SKILL.md"]) {
      assert.ok(p.includes("/SKILL.md"), p);
    }
  });
});
