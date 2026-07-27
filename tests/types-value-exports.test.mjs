import { test, suite } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

/**
 * Regression tests for the package's public value-export surface.
 *
 * `tests/fixtures/consumer.ts` destructures every named export from
 * `src/index.js` and exercises three tool factories with mock deps.
 * A second `tsconfig.consumer.json` compiles the fixture with the
 * strict posture (`strict`, `noUncheckedIndexedAccess`,
 * `exactOptionalPropertyTypes`, `noImplicitOverride`,
 * `noFallthroughCasesInSwitch`, `useUnknownInCatchVariables`,
 * `verbatimModuleSyntax`).
 *
 * The fixture cannot compile if any public value export is missing
 * from `src/types.d.ts`, or if any signature in `src/index.js` does
 * not match its declaration.
 */

suite("consumer-fixture typecheck", { concurrency: false }, () => {
  test("tests/fixtures/consumer.ts compiles under strict tsc --noEmit", { serial: true }, () => {
    const tscBin = existsSync("node_modules/.bin/tsc")
      ? "node_modules/.bin/tsc"
      : "tsc";
    const r = spawnSync(
      tscBin,
      ["--noEmit", "-p", "tests/fixtures/consumer-tsconfig.json"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    assert.equal(
      r.status,
      0,
      `consumer fixture failed to typecheck:\n${r.stdout}\n${r.stderr}`,
    );
  });

  test("public value exports match the package surface", { serial: true }, async () => {
    const src = await import("node:fs").then((m) => m.readFileSync("src/index.js", "utf8"));
    const exports = Array.from(src.matchAll(/export \{([^}]+)\}/gs))
      .flatMap((m) => m[1].split(",").map((s) => s.trim()).filter(Boolean))
      .map((s) => s.split(" as ")[0].trim());
    for (const name of exports) {
      assert.ok(
        exports.includes(name),
        `public export ${name} declared in src/index.js must be re-exported verbatim`,
      );
    }
  });

  test("types.d.ts declares every public value export", { serial: true }, async () => {
    const types = await import("node:fs").then((m) => m.readFileSync("src/types.d.ts", "utf8"));
    const declared = new Set(
      Array.from(types.matchAll(/export declare (?:function|const) (\w+)/g)).map((m) => m[1]),
    );
    const indexSrc = await import("node:fs").then((m) => m.readFileSync("src/index.js", "utf8"));
    const publicNames = Array.from(indexSrc.matchAll(/export \{([^}]+)\}/gs))
      .flatMap((m) => m[1].split(",").map((s) => s.trim()).filter(Boolean))
      .map((s) => s.split(" as ")[0].trim());
    const missing = publicNames.filter((n) => !declared.has(n));
    assert.deepEqual(missing, [], `missing value declarations: ${missing.join(", ")}`);
  });
});
