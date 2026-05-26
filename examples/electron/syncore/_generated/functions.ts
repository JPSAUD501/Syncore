/**
 * Generated Syncore function registry.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx syncorejs dev` or `npx syncorejs codegen`.
 * @module
 */

import type { SyncoreFunctionRegistry } from "syncorejs";
import { composeProjectFunctionRegistry } from "syncorejs";
import { attachFile as entries__attachFile } from "../functions/entries.js";
import { byMood as entries__byMood } from "../functions/entries.js";
import { getByDate as entries__getByDate } from "../functions/entries.js";
import { list as entries__list } from "../functions/entries.js";
import { listAttachments as entries__listAttachments } from "../functions/entries.js";
import { remove as entries__remove } from "../functions/entries.js";
import { removeAttachment as entries__removeAttachment } from "../functions/entries.js";
import { search as entries__search } from "../functions/entries.js";
import { seedDemo as entries__seedDemo } from "../functions/entries.js";
import { stats as entries__stats } from "../functions/entries.js";
import { upsert as entries__upsert } from "../functions/entries.js";

const componentsManifest = {} as const;

/**
 * Type-safe runtime definitions for every function exported from `syncore/functions`.
 */
export interface SyncoreRootFunctionsRegistry extends SyncoreFunctionRegistry {
  /**
   * Runtime definition for the public Syncore mutation `entries/attachFile`.
   */
  readonly "entries/attachFile": typeof entries__attachFile;
  /**
   * Runtime definition for the public Syncore query `entries/byMood`.
   */
  readonly "entries/byMood": typeof entries__byMood;
  /**
   * Runtime definition for the public Syncore query `entries/getByDate`.
   */
  readonly "entries/getByDate": typeof entries__getByDate;
  /**
   * Runtime definition for the public Syncore query `entries/list`.
   */
  readonly "entries/list": typeof entries__list;
  /**
   * Runtime definition for the public Syncore query `entries/listAttachments`.
   */
  readonly "entries/listAttachments": typeof entries__listAttachments;
  /**
   * Runtime definition for the public Syncore mutation `entries/remove`.
   */
  readonly "entries/remove": typeof entries__remove;
  /**
   * Runtime definition for the public Syncore mutation `entries/removeAttachment`.
   */
  readonly "entries/removeAttachment": typeof entries__removeAttachment;
  /**
   * Runtime definition for the public Syncore query `entries/search`.
   */
  readonly "entries/search": typeof entries__search;
  /**
   * Runtime definition for the public Syncore mutation `entries/seedDemo`.
   */
  readonly "entries/seedDemo": typeof entries__seedDemo;
  /**
   * Runtime definition for the public Syncore query `entries/stats`.
   */
  readonly "entries/stats": typeof entries__stats;
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
const rootFunctions: SyncoreRootFunctionsRegistry = {
  "entries/list": entries__list,
  "entries/getByDate": entries__getByDate,
  "entries/search": entries__search,
  "entries/stats": entries__stats,
  "entries/byMood": entries__byMood,
  "entries/upsert": entries__upsert,
  "entries/seedDemo": entries__seedDemo,
  "entries/remove": entries__remove,
  "entries/listAttachments": entries__listAttachments,
  "entries/attachFile": entries__attachFile,
  "entries/removeAttachment": entries__removeAttachment,
} as const;

export const functions: SyncoreFunctionRegistry = composeProjectFunctionRegistry(rootFunctions, componentsManifest);
