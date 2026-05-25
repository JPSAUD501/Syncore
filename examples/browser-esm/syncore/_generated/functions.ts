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
import { create as contacts__create } from "../functions/contacts";
import { list as contacts__list } from "../functions/contacts";
import { remove as contacts__remove } from "../functions/contacts";
import { search as contacts__search } from "../functions/contacts";
import { seedDemo as contacts__seedDemo } from "../functions/contacts";
import { stats as contacts__stats } from "../functions/contacts";
import { toggleFavorite as contacts__toggleFavorite } from "../functions/contacts";

const componentsManifest = {} as const;

/**
 * Type-safe runtime definitions for every function exported from `syncore/functions`.
 */
export interface SyncoreRootFunctionsRegistry extends SyncoreFunctionRegistry {
  /**
   * Runtime definition for the public Syncore mutation `contacts/create`.
   */
  readonly "contacts/create": typeof contacts__create;
  /**
   * Runtime definition for the public Syncore query `contacts/list`.
   */
  readonly "contacts/list": typeof contacts__list;
  /**
   * Runtime definition for the public Syncore mutation `contacts/remove`.
   */
  readonly "contacts/remove": typeof contacts__remove;
  /**
   * Runtime definition for the public Syncore query `contacts/search`.
   */
  readonly "contacts/search": typeof contacts__search;
  /**
   * Runtime definition for the public Syncore mutation `contacts/seedDemo`.
   */
  readonly "contacts/seedDemo": typeof contacts__seedDemo;
  /**
   * Runtime definition for the public Syncore query `contacts/stats`.
   */
  readonly "contacts/stats": typeof contacts__stats;
  /**
   * Runtime definition for the public Syncore mutation `contacts/toggleFavorite`.
   */
  readonly "contacts/toggleFavorite": typeof contacts__toggleFavorite;
}

/**
 * The runtime registry for every function exported from `syncore/functions`.
 *
 * Most application code should import from `./api` instead of using this map directly.
 */
const rootFunctions: SyncoreRootFunctionsRegistry = {
  "contacts/list": contacts__list,
  "contacts/stats": contacts__stats,
  "contacts/search": contacts__search,
  "contacts/create": contacts__create,
  "contacts/toggleFavorite": contacts__toggleFavorite,
  "contacts/seedDemo": contacts__seedDemo,
  "contacts/remove": contacts__remove,
} as const;

export const functions: SyncoreFunctionRegistry = composeProjectFunctionRegistry(rootFunctions, componentsManifest);
