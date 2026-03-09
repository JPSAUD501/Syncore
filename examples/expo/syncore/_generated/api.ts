/**
 * Generated `api` utility for referencing Syncore functions.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx syncore dev` or `npx syncore codegen`.
 * @module
 */

import { createFunctionReferenceFor } from "syncore";
import type { FunctionReferenceFor } from "syncore";
import type { create as notes__create } from "../functions/notes";
import type { createFromScheduler as notes__createFromScheduler } from "../functions/notes";
import type { list as notes__list } from "../functions/notes";
import type { resetAll as notes__resetAll } from "../functions/notes";
import type { scheduleCreateCatchUp as notes__scheduleCreateCatchUp } from "../functions/notes";
import type { scheduleCreateSkip as notes__scheduleCreateSkip } from "../functions/notes";
import type { togglePinned as notes__togglePinned } from "../functions/notes";

/**
 * Type-safe references to functions exported from `syncore/functions/notes.ts`.
 */
export interface SyncoreApi__notes {
  /**
   * Reference to the public Syncore mutation `notes/create`.
   */
  readonly create: FunctionReferenceFor<typeof notes__create>;
  /**
   * Reference to the public Syncore mutation `notes/createFromScheduler`.
   */
  readonly createFromScheduler: FunctionReferenceFor<typeof notes__createFromScheduler>;
  /**
   * Reference to the public Syncore query `notes/list`.
   */
  readonly list: FunctionReferenceFor<typeof notes__list>;
  /**
   * Reference to the public Syncore mutation `notes/resetAll`.
   */
  readonly resetAll: FunctionReferenceFor<typeof notes__resetAll>;
  /**
   * Reference to the public Syncore mutation `notes/scheduleCreateCatchUp`.
   */
  readonly scheduleCreateCatchUp: FunctionReferenceFor<typeof notes__scheduleCreateCatchUp>;
  /**
   * Reference to the public Syncore mutation `notes/scheduleCreateSkip`.
   */
  readonly scheduleCreateSkip: FunctionReferenceFor<typeof notes__scheduleCreateSkip>;
  /**
   * Reference to the public Syncore mutation `notes/togglePinned`.
   */
  readonly togglePinned: FunctionReferenceFor<typeof notes__togglePinned>;
}
/**
 * Type-safe references to every public Syncore function in this app.
 */
export interface SyncoreApi {
  /**
   * Functions exported from `syncore/functions/notes.ts`.
   */
  readonly notes: SyncoreApi__notes;
}

/**
 * A utility for referencing Syncore functions in your app's public API.
 *
 * Usage:
 * ```ts
 * const listTasks = api.tasks.list;
 * ```
 */
export const api: SyncoreApi = { notes: { create: createFunctionReferenceFor<typeof notes__create>("mutation", "notes/create"), createFromScheduler: createFunctionReferenceFor<typeof notes__createFromScheduler>("mutation", "notes/createFromScheduler"), list: createFunctionReferenceFor<typeof notes__list>("query", "notes/list"), resetAll: createFunctionReferenceFor<typeof notes__resetAll>("mutation", "notes/resetAll"), scheduleCreateCatchUp: createFunctionReferenceFor<typeof notes__scheduleCreateCatchUp>("mutation", "notes/scheduleCreateCatchUp"), scheduleCreateSkip: createFunctionReferenceFor<typeof notes__scheduleCreateSkip>("mutation", "notes/scheduleCreateSkip"), togglePinned: createFunctionReferenceFor<typeof notes__togglePinned>("mutation", "notes/togglePinned") } } as const;
