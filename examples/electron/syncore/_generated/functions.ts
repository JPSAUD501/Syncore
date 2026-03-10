/**
 * Generated Syncore function registry.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx syncorejs dev` or `npx syncorejs codegen`.
 * @module
 */

import type { SyncoreFunctionRegistry } from "syncorejs";

import { getByDate as entries__getByDate } from "../functions/entries";
import { list as entries__list } from "../functions/entries";
import { remove as entries__remove } from "../functions/entries";
import { search as entries__search } from "../functions/entries";
import { upsert as entries__upsert } from "../functions/entries";

/**
 * Type-safe runtime definitions for every function exported from `syncore/functions`.
 */
export interface SyncoreFunctionsRegistry extends SyncoreFunctionRegistry {
  /**
   * Runtime definition for the public Syncore query `entries/getByDate`.
   */
  readonly "entries/getByDate": typeof entries__getByDate;
  /**
   * Runtime definition for the public Syncore query `entries/list`.
   */
  readonly "entries/list": typeof entries__list;
  /**
   * Runtime definition for the public Syncore mutation `entries/remove`.
   */
  readonly "entries/remove": typeof entries__remove;
  /**
   * Runtime definition for the public Syncore query `entries/search`.
   */
  readonly "entries/search": typeof entries__search;
  /**
   * Runtime definition for the public Syncore mutation `entries/upsert`.
   */
  readonly "entries/upsert": typeof entries__upsert;
}

/**
 * The runtime registry for every function exported from `syncore/functions`.
 *
 * Most application code should import from `./api` instead of using this map directly.
 */
export const functions: SyncoreFunctionsRegistry = {
  "entries/list": entries__list,
  "entries/getByDate": entries__getByDate,
  "entries/search": entries__search,
  "entries/upsert": entries__upsert,
  "entries/remove": entries__remove,
} as const;
