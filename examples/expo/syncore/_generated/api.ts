/**
 * Generated `api` utility for referencing Syncore functions.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx syncorejs dev` or `npx syncorejs codegen`.
 * @module
 */

import { createFunctionReferenceFor } from "syncorejs";
import type { FunctionReferenceFor } from "syncorejs";
import type { create as notes__create } from "../functions/notes";
import type { get as notes__get } from "../functions/notes";
import type { list as notes__list } from "../functions/notes";
import type { remove as notes__remove } from "../functions/notes";
import type { scheduleAutoSave as notes__scheduleAutoSave } from "../functions/notes";
import type { search as notes__search } from "../functions/notes";
import type { togglePin as notes__togglePin } from "../functions/notes";
import type { update as notes__update } from "../functions/notes";

/**
 * Type-safe references to functions exported from `syncore/functions/notes.ts`.
 */
export interface SyncoreApi__notes {
  /**
   * Reference to the public Syncore mutation `notes/create`.
   */
  readonly create: FunctionReferenceFor<typeof notes__create>;
  /**
   * Reference to the public Syncore query `notes/get`.
   */
  readonly get: FunctionReferenceFor<typeof notes__get>;
  /**
   * Reference to the public Syncore query `notes/list`.
   */
  readonly list: FunctionReferenceFor<typeof notes__list>;
  /**
   * Reference to the public Syncore mutation `notes/remove`.
   */
  readonly remove: FunctionReferenceFor<typeof notes__remove>;
  /**
   * Reference to the public Syncore mutation `notes/scheduleAutoSave`.
   */
  readonly scheduleAutoSave: FunctionReferenceFor<typeof notes__scheduleAutoSave>;
  /**
   * Reference to the public Syncore query `notes/search`.
   */
  readonly search: FunctionReferenceFor<typeof notes__search>;
  /**
   * Reference to the public Syncore mutation `notes/togglePin`.
   */
  readonly togglePin: FunctionReferenceFor<typeof notes__togglePin>;
  /**
   * Reference to the public Syncore mutation `notes/update`.
   */
  readonly update: FunctionReferenceFor<typeof notes__update>;
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
export const api: SyncoreApi = { notes: { create: createFunctionReferenceFor<typeof notes__create>("mutation", "notes/create"), get: createFunctionReferenceFor<typeof notes__get>("query", "notes/get"), list: createFunctionReferenceFor<typeof notes__list>("query", "notes/list"), remove: createFunctionReferenceFor<typeof notes__remove>("mutation", "notes/remove"), scheduleAutoSave: createFunctionReferenceFor<typeof notes__scheduleAutoSave>("mutation", "notes/scheduleAutoSave"), search: createFunctionReferenceFor<typeof notes__search>("query", "notes/search"), togglePin: createFunctionReferenceFor<typeof notes__togglePin>("mutation", "notes/togglePin"), update: createFunctionReferenceFor<typeof notes__update>("mutation", "notes/update") } } as const;
