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
import type { create as bookmarks__create } from "../functions/bookmarks";
import type { list as bookmarks__list } from "../functions/bookmarks";
import type { listByTag as bookmarks__listByTag } from "../functions/bookmarks";
import type { remove as bookmarks__remove } from "../functions/bookmarks";
import type { search as bookmarks__search } from "../functions/bookmarks";
import type { toggleStar as bookmarks__toggleStar } from "../functions/bookmarks";
import type { update as bookmarks__update } from "../functions/bookmarks";

/**
 * Type-safe references to functions exported from `syncore/functions/bookmarks.ts`.
 */
export interface SyncoreApi__bookmarks {
  /**
   * Reference to the public Syncore mutation `bookmarks/create`.
   */
  readonly create: FunctionReferenceFor<typeof bookmarks__create>;
  /**
   * Reference to the public Syncore query `bookmarks/list`.
   */
  readonly list: FunctionReferenceFor<typeof bookmarks__list>;
  /**
   * Reference to the public Syncore query `bookmarks/listByTag`.
   */
  readonly listByTag: FunctionReferenceFor<typeof bookmarks__listByTag>;
  /**
   * Reference to the public Syncore mutation `bookmarks/remove`.
   */
  readonly remove: FunctionReferenceFor<typeof bookmarks__remove>;
  /**
   * Reference to the public Syncore query `bookmarks/search`.
   */
  readonly search: FunctionReferenceFor<typeof bookmarks__search>;
  /**
   * Reference to the public Syncore mutation `bookmarks/toggleStar`.
   */
  readonly toggleStar: FunctionReferenceFor<typeof bookmarks__toggleStar>;
  /**
   * Reference to the public Syncore mutation `bookmarks/update`.
   */
  readonly update: FunctionReferenceFor<typeof bookmarks__update>;
}
/**
 * Type-safe references to every public Syncore function in this app.
 */
export interface SyncoreApi {
  /**
   * Functions exported from `syncore/functions/bookmarks.ts`.
   */
  readonly bookmarks: SyncoreApi__bookmarks;
}

/**
 * A utility for referencing Syncore functions in your app's public API.
 *
 * Usage:
 * ```ts
 * const listTasks = api.tasks.list;
 * ```
 */
export const api: SyncoreApi = { bookmarks: { create: createFunctionReferenceFor<typeof bookmarks__create>("mutation", "bookmarks/create"), list: createFunctionReferenceFor<typeof bookmarks__list>("query", "bookmarks/list"), listByTag: createFunctionReferenceFor<typeof bookmarks__listByTag>("query", "bookmarks/listByTag"), remove: createFunctionReferenceFor<typeof bookmarks__remove>("mutation", "bookmarks/remove"), search: createFunctionReferenceFor<typeof bookmarks__search>("query", "bookmarks/search"), toggleStar: createFunctionReferenceFor<typeof bookmarks__toggleStar>("mutation", "bookmarks/toggleStar"), update: createFunctionReferenceFor<typeof bookmarks__update>("mutation", "bookmarks/update") } } as const;
