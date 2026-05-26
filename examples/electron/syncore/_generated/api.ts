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
export { components } from "./components.js";

import type { attachFile as entries__attachFile } from "../functions/entries.js";
import type { byMood as entries__byMood } from "../functions/entries.js";
import type { getByDate as entries__getByDate } from "../functions/entries.js";
import type { list as entries__list } from "../functions/entries.js";
import type { listAttachments as entries__listAttachments } from "../functions/entries.js";
import type { remove as entries__remove } from "../functions/entries.js";
import type { removeAttachment as entries__removeAttachment } from "../functions/entries.js";
import type { search as entries__search } from "../functions/entries.js";
import type { seedDemo as entries__seedDemo } from "../functions/entries.js";
import type { stats as entries__stats } from "../functions/entries.js";
import type { upsert as entries__upsert } from "../functions/entries.js";

/**
 * Type-safe references to functions exported from `syncore/functions/entries.ts`.
 */
export interface SyncoreApi__entries {
  /**
   * Reference to the public Syncore mutation `entries/attachFile`.
   */
  readonly attachFile: FunctionReferenceFor<typeof entries__attachFile>;
  /**
   * Reference to the public Syncore query `entries/byMood`.
   */
  readonly byMood: FunctionReferenceFor<typeof entries__byMood>;
  /**
   * Reference to the public Syncore query `entries/getByDate`.
   */
  readonly getByDate: FunctionReferenceFor<typeof entries__getByDate>;
  /**
   * Reference to the public Syncore query `entries/list`.
   */
  readonly list: FunctionReferenceFor<typeof entries__list>;
  /**
   * Reference to the public Syncore query `entries/listAttachments`.
   */
  readonly listAttachments: FunctionReferenceFor<typeof entries__listAttachments>;
  /**
   * Reference to the public Syncore mutation `entries/remove`.
   */
  readonly remove: FunctionReferenceFor<typeof entries__remove>;
  /**
   * Reference to the public Syncore mutation `entries/removeAttachment`.
   */
  readonly removeAttachment: FunctionReferenceFor<typeof entries__removeAttachment>;
  /**
   * Reference to the public Syncore query `entries/search`.
   */
  readonly search: FunctionReferenceFor<typeof entries__search>;
  /**
   * Reference to the public Syncore mutation `entries/seedDemo`.
   */
  readonly seedDemo: FunctionReferenceFor<typeof entries__seedDemo>;
  /**
   * Reference to the public Syncore query `entries/stats`.
   */
  readonly stats: FunctionReferenceFor<typeof entries__stats>;
  /**
   * Reference to the public Syncore mutation `entries/upsert`.
   */
  readonly upsert: FunctionReferenceFor<typeof entries__upsert>;
}
/**
 * Type-safe references to every public Syncore function in this app.
 */
export interface SyncoreApi {
  /**
   * Functions exported from `syncore/functions/entries.ts`.
   */
  readonly entries: SyncoreApi__entries;
}

/**
 * A utility for referencing Syncore functions in your app's public API.
 *
 * Usage:
 * ```ts
 * const listTasks = api.tasks.list;
 * ```
 */
export const api: SyncoreApi = { entries: { attachFile: createFunctionReferenceFor<typeof entries__attachFile>("mutation", "entries/attachFile"), byMood: createFunctionReferenceFor<typeof entries__byMood>("query", "entries/byMood"), getByDate: createFunctionReferenceFor<typeof entries__getByDate>("query", "entries/getByDate"), list: createFunctionReferenceFor<typeof entries__list>("query", "entries/list"), listAttachments: createFunctionReferenceFor<typeof entries__listAttachments>("query", "entries/listAttachments"), remove: createFunctionReferenceFor<typeof entries__remove>("mutation", "entries/remove"), removeAttachment: createFunctionReferenceFor<typeof entries__removeAttachment>("mutation", "entries/removeAttachment"), search: createFunctionReferenceFor<typeof entries__search>("query", "entries/search"), seedDemo: createFunctionReferenceFor<typeof entries__seedDemo>("mutation", "entries/seedDemo"), stats: createFunctionReferenceFor<typeof entries__stats>("query", "entries/stats"), upsert: createFunctionReferenceFor<typeof entries__upsert>("mutation", "entries/upsert") } } as const;
