/**
 * Contract-version-2 envelope helpers.
 *
 * Every typed tool returns one of two shapes:
 *
 *   type Success<K extends string, D> = {
 *     contractVersion: 2
 *     ok: true
 *     kind: K
 *     operationId: string
 *     idempotent: boolean
 *     data: D
 *   }
 *
 *   type Failure<K extends string, D = Record<string, never>> = {
 *     contractVersion: 2
 *     ok: false
 *     kind: K
 *     operationId: string
 *     retryable: boolean
 *     message: string
 *     details: D
 *   }
 *
 * The envelope is a single source of truth for the
 * controller / planner / reviewer / verifier round-trip.
 * Tests and audit logs depend on the exact field set.
 */

import { randomBytes } from "node:crypto";

export const CONTRACT_VERSION = 2;

/**
 * Produce a stable, single-run operation id. Operation ids are
 * not secrets; they are a debugging handle so a single
 * controller action can be correlated across logs.
 */
export function operationId(prefix = "op") {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
}

/**
 * Build a success envelope.
 *
 * @template K, D
 * @param {K} kind Stable kind identifier (e.g. "issue-create").
 * @param {D} data Operation-specific payload.
 * @param {{ operationId?: string, idempotent?: boolean }} [options]
 * @returns {{ contractVersion: 2, ok: true, kind: K, operationId: string, idempotent: boolean, data: D }}
 */
export function success(kind, data, options = {}) {
  if (typeof kind !== "string" || kind.length === 0) {
    throw new Error("envelope.success: kind must be a non-empty string");
  }
  return {
    contractVersion: CONTRACT_VERSION,
    ok: true,
    kind,
    operationId: options.operationId ?? operationId(kind),
    idempotent: options.idempotent !== false,
    data,
  };
}

/**
 * Build a failure envelope.
 *
 * @template K, D
 * @param {K} kind Stable kind identifier.
 * @param {string} message Human-readable explanation.
 * @param {{ retryable?: boolean, details?: D, operationId?: string }} [options]
 * @returns {{ contractVersion: 2, ok: false, kind: K, operationId: string, retryable: boolean, message: string, details: D }}
 */
export function failure(kind, message, options = {}) {
  if (typeof kind !== "string" || kind.length === 0) {
    throw new Error("envelope.failure: kind must be a non-empty string");
  }
  if (typeof message !== "string" || message.length === 0) {
    throw new Error("envelope.failure: message must be a non-empty string");
  }
  /** @type {any} */
  const details = options.details ?? {};
  return {
    contractVersion: CONTRACT_VERSION,
    ok: false,
    kind,
    operationId: options.operationId ?? operationId(`${kind}-err`),
    retryable: options.retryable === true,
    message,
    details,
  };
}

/**
 * Test whether a value is a valid success envelope of the
 * given kind. Used by tests and by the controller when it
 * receives a tool result and needs to discriminate.
 *
 * @param {unknown} value
 * @param {string} [expectedKind]
 * @returns {boolean}
 */
export function isSuccess(value, expectedKind) {
  if (!value || typeof value !== "object") return false;
  const v = /** @type {any} */ (value);
  if (v.contractVersion !== CONTRACT_VERSION) return false;
  if (v.ok !== true) return false;
  if (typeof v.kind !== "string") return false;
  if (expectedKind && v.kind !== expectedKind) return false;
  return true;
}

/**
 * Test whether a value is a valid failure envelope.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isFailure(value) {
  if (!value || typeof value !== "object") return false;
  const v = /** @type {any} */ (value);
  if (v.contractVersion !== CONTRACT_VERSION) return false;
  if (v.ok !== false) return false;
  if (typeof v.kind !== "string") return false;
  if (typeof v.message !== "string") return false;
  return typeof v.operationId === "string";
}
