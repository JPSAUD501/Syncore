/**
 * Generated Syncore function registry.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx syncorejs dev` or `npx syncorejs codegen`.
 * @module
 */

import type { SyncoreFunctionRegistry } from "syncorejs";

import { create as bookmarks__create } from "../functions/bookmarks";
import { list as bookmarks__list } from "../functions/bookmarks";
import { listByTag as bookmarks__listByTag } from "../functions/bookmarks";
import { remove as bookmarks__remove } from "../functions/bookmarks";
import { search as bookmarks__search } from "../functions/bookmarks";
import { toggleStar as bookmarks__toggleStar } from "../functions/bookmarks";
import { update as bookmarks__update } from "../functions/bookmarks";

/**
 * Type-safe runtime definitions for every function exported from `syncore/functions`.
 */
export interface SyncoreFunctionsRegistry extends SyncoreFunctionRegistry {
  /**
   * Runtime definition for the public Syncore mutation `bookmarks/create`.
   */
  readonly "bookmarks/create": typeof bookmarks__create;
  /**
   * Runtime definition for the public Syncore query `bookmarks/list`.
   */
  readonly "bookmarks/list": typeof bookmarks__list;
  /**
   * Runtime definition for the public Syncore query `bookmarks/listByTag`.
   */
  readonly "bookmarks/listByTag": typeof bookmarks__listByTag;
  /**
   * Runtime definition for the public Syncore mutation `bookmarks/remove`.
   */
  readonly "bookmarks/remove": typeof bookmarks__remove;
  /**
   * Runtime definition for the public Syncore query `bookmarks/search`.
   */
  readonly "bookmarks/search": typeof bookmarks__search;
  /**
   * Runtime definition for the public Syncore mutation `bookmarks/toggleStar`.
   */
  readonly "bookmarks/toggleStar": typeof bookmarks__toggleStar;
  /**
   * Runtime definition for the public Syncore mutation `bookmarks/update`.
   */
  readonly "bookmarks/update": typeof bookmarks__update;
}

/**
 * The runtime registry for every function exported from `syncore/functions`.
 *
 * Most application code should import from `./api` instead of using this map directly.
 */
export const functions: SyncoreFunctionsRegistry = {
  "bookmarks/list": bookmarks__list,
  "bookmarks/listByTag": bookmarks__listByTag,
  "bookmarks/search": bookmarks__search,
  "bookmarks/create": bookmarks__create,
  "bookmarks/update": bookmarks__update,
  "bookmarks/toggleStar": bookmarks__toggleStar,
  "bookmarks/remove": bookmarks__remove,
} as const;
