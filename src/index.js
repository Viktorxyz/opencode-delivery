/**
 * Public package surface.
 *
 * Consumers import this entry to wire the delivery tools into their
 * OpenCode plugin. We deliberately export factories (not singletons)
 * so each consumer repo can inject its own driver and repoRoot.
 */

export { ADAPTER_CONTRACT_VERSION, ADAPTER_FILENAME, LOCK_FILENAME, loadAdapter, validateAdapter, writeLock, readLock, findOpencodeDir } from "./adapter.js";

export { STATES, createManifest, transition, canTransition, isTerminal, mustRerunReview, mustRerunVerifier } from "./state/lifecycle.js";

export { listManifests, readManifest, writeManifest, deleteManifest } from "./state/manifest-store.js";

export * from "./drivers/git.js";
export { createGhDriver } from "./drivers/gh-cli.js";
export { parseRepoSlug } from "./drivers/github.js";

export { scanRecovery, wouldCleanupBeSafe, removeManifestIfSafe, recoverManifestAfterCrash } from "./recovery.js";

export { doctor } from "./doctor.js";

export { createInspectTool } from "./tools/delivery-inspect.js";
export { createIssueTool } from "./tools/delivery-issue.js";
export { createWorktreeTool } from "./tools/delivery-worktree.js";
export { createVerifyTool } from "./tools/delivery-verify.js";
export { createPrTool } from "./tools/delivery-pr.js";
export { createReadyTool } from "./tools/delivery-ready.js";
export { createMergeTool } from "./tools/delivery-merge.js";
export { createCleanupTool } from "./tools/delivery-cleanup.js";

export const PACKAGE_VERSION = "0.1.0";
