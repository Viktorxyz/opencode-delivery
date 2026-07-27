/**
 * Public package surface.
 *
 * Consumers import this entry to wire the delivery tools into their
 * OpenCode plugin. We deliberately export factories (not singletons)
 * so each consumer repo can inject its own driver and repoRoot.
 */

export { ADAPTER_CONTRACT_VERSION, ADAPTER_FILENAME, LOCK_FILENAME, loadAdapter, validateAdapter, writeLock, readLock, findOpencodeDir } from "./adapter.ts";

export { STATES, createManifest, transition, canTransition, isTerminal, mustRerunReview, mustRerunVerifier } from "./state/lifecycle.js";

export { listManifests, readManifest, writeManifest, deleteManifest } from "./state/manifest-store.ts";

export * from "./drivers/git.ts";
export { createGhDriver } from "./drivers/gh-cli.ts";
export { parseRepoSlug } from "./drivers/github.ts";

export { scanRecovery, wouldCleanupBeSafe, removeManifestIfSafe, recoverManifestAfterCrash } from "./recovery.ts";

export { doctor } from "./doctor.ts";

export { createInspectTool } from "./tools/delivery-inspect.ts";
export { createIssueTool } from "./tools/delivery-issue.ts";
export { createWorktreeTool } from "./tools/delivery-worktree.ts";
export { createVerifyTool } from "./tools/delivery-verify.ts";
export { createPrTool } from "./tools/delivery-pr.ts";
export { createReadyTool } from "./tools/delivery-ready.ts";
export { createMergeTool } from "./tools/delivery-merge.ts";
export { createCleanupTool } from "./tools/delivery-cleanup.ts";

export const PACKAGE_VERSION = "0.1.0";
