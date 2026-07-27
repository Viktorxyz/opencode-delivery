#!/usr/bin/env node
/* eslint-disable no-console */
import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const ROOTS = ["src", "tests", "scripts", "agents", "skills"];
const EXTS = new Set([".js", ".mjs", ".ts", ".md", ".json"]);

// Files whose content defines the rules themselves, plus documentation,
// must not be linted against the rules.
const WHITELIST = new Set([
  "scripts/lint.mjs",
  // Documentation files describe the policy in prose; they are not
  // shell invocations. Markdown content is not runnable.
]);

const RULES = [
  {
    reason: "raw `gh api *` shortcut bypasses driver merge gates",
    predicate: (line) => /\bgh\s+api\b/.test(line),
  },
  {
    reason: "force-push variants are not permitted by the driver",
    predicate: (line) => /\bgit\s+push\s+(?:--force|--force-with-lease|-f)\b/.test(line),
  },
  {
    reason: "git reset --hard is not permitted",
    predicate: (line) => /\bgit\s+reset\s+--hard\b/.test(line),
  },
  {
    reason: "git stash is not permitted",
    predicate: (line) => /\bgit\s+stash\b/.test(line),
  },
  {
    reason: "git worktree remove --force is not permitted",
    predicate: (line) => /\bgit\s+worktree\s+remove\s+--force\b/.test(line),
  },
  {
    reason: "git branch -D inside the core is reserved for safe cleanup only",
    predicate: (line) => /\bgit\s+branch\s+-D\b/.test(line),
  },
];

async function* walk(dir) {
  for (const name of await readdir(dir, { withFileTypes: true })) {
    const p = resolve(dir, name.name);
    if (name.isDirectory()) {
      if (name.name === "node_modules" || name.name === ".git") continue;
      yield* walk(p);
    } else {
      yield p;
    }
  }
}

function isCommentLine(line) {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("#") || t.startsWith("/*") || t.startsWith("*");
}

// A JavaScript regex literal (=> /.../flag, = /.../flag, or array entry).
function isRegexLiteralContext(line) {
  return /(?:=>\s*|=|\(\s*\)|\s|^\s*)\/[^/\n]+\/[gimsuy]*\s*[,)]?\s*$/.test(line.trim());
}

function* nonCommentLines(text) {
  let inBlock = false;
  const lines = text.split("\n");
  for (const line of lines) {
    const t = line.trim();
    if (inBlock) {
      if (t.includes("*/")) {
        inBlock = false;
        const after = line.slice(line.indexOf("*/") + 2);
        if (after.trim().length > 0) yield after;
      }
      continue;
    }
    if (t.startsWith("/*")) {
      if (!t.includes("*/")) {
        inBlock = true;
        continue;
      }
      const after = line.slice(line.indexOf("*/") + 2);
      if (after.trim().length > 0) yield after;
      continue;
    }
    if (isCommentLine(line)) continue;
    yield line;
  }
}

async function main() {
  let violations = 0;
  const here = process.cwd();
  for (const root of ROOTS) {
    let exists = true;
    try {
      await stat(root);
    } catch {
      exists = false;
    }
    if (!exists) continue;
    for await (const abs of walk(resolve(here, root))) {
      const rel = abs.slice(here.length + 1);
      if (WHITELIST.has(rel)) continue;
      if (rel.endsWith(".md")) continue;
      const ext = rel.slice(rel.lastIndexOf("."));
      if (!EXTS.has(ext)) continue;
      const text = await readFile(abs, "utf8");
      let lineNo = 0;
      for (const line of nonCommentLines(text)) {
        lineNo++;
        if (isRegexLiteralContext(line)) continue;
        for (const rule of RULES) {
          if (rule.predicate(line)) {
            console.error(`${rel} (offset line ${lineNo}): ${rule.reason}`);
            violations++;
          }
        }
      }
    }
  }
  if (violations > 0) {
    console.error(`lint failed: ${violations} forbidden pattern match(es)`);
    process.exit(1);
  }
  console.log("lint passed: 0 forbidden pattern matches");
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
