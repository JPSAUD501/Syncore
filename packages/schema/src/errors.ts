/**
 * Machine-readable reason attached to a {@link SyncoreValidationError}.
 *
 * - `invalid_type` — the value has the wrong type (`value.title must be a string.`).
 * - `missing_field` — a required object field is absent.
 * - `unknown_field` — an object carries a field its validator does not declare.
 * - `invalid_value` — the type is right but the value is not allowed (literal, enum).
 * - `union_mismatch` — no member of a union accepted the value.
 * - `system_field` — `_id` / `_creationTime` were written where they are not allowed.
 */
export type SyncoreValidationErrorCode =
  | "invalid_type"
  | "missing_field"
  | "unknown_field"
  | "invalid_value"
  | "union_mismatch"
  | "system_field";

/**
 * Thrown when a value does not match a Syncore validator — function
 * arguments, return values, documents written to a table, or component config.
 *
 * `path` points at the offending value (`args.settings.theme`), `code` says
 * why. The message is self-describing because errors that cross a transport
 * (IPC, WebSocket, worker) are rebuilt as plain `Error`s; use
 * {@link isSyncoreValidationError} rather than `instanceof` when the error may
 * have crossed one.
 */
export class SyncoreValidationError extends Error {
  override readonly name = "SyncoreValidationError";

  constructor(
    message: string,
    readonly code: SyncoreValidationErrorCode,
    readonly path: string,
    readonly issues?: readonly SyncoreValidationError[]
  ) {
    super(message);
  }
}

/**
 * Returns `true` for a {@link SyncoreValidationError}, including one whose
 * prototype was lost (matched by `name`).
 */
export function isSyncoreValidationError(
  error: unknown
): error is SyncoreValidationError {
  return (
    error instanceof SyncoreValidationError ||
    (error instanceof Error && error.name === "SyncoreValidationError")
  );
}
