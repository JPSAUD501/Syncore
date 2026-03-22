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
import { create as notes__create } from "../functions/notes";
import { get as notes__get } from "../functions/notes";
import { list as notes__list } from "../functions/notes";
import { remove as notes__remove } from "../functions/notes";
import { scheduleAutoSave as notes__scheduleAutoSave } from "../functions/notes";
import { search as notes__search } from "../functions/notes";
import { togglePin as notes__togglePin } from "../functions/notes";
import { update as notes__update } from "../functions/notes";

const componentsManifest = {} as const;

/**
 * Type-safe runtime definitions for every function exported from `syncore/functions`.
 */
export interface SyncoreRootFunctionsRegistry extends SyncoreFunctionRegistry {
  /**
   * Runtime definition for the public Syncore mutation `notes/create`.
   */
  readonly "notes/create": typeof notes__create;
  /**
   * Runtime definition for the public Syncore query `notes/get`.
   */
  readonly "notes/get": typeof notes__get;
  /**
   * Runtime definition for the public Syncore query `notes/list`.
   */
  readonly "notes/list": typeof notes__list;
  /**
   * Runtime definition for the public Syncore mutation `notes/remove`.
   */
  readonly "notes/remove": typeof notes__remove;
  /**
   * Runtime definition for the public Syncore mutation `notes/scheduleAutoSave`.
   */
  readonly "notes/scheduleAutoSave": typeof notes__scheduleAutoSave;
  /**
   * Runtime definition for the public Syncore query `notes/search`.
   */
  readonly "notes/search": typeof notes__search;
  /**
   * Runtime definition for the public Syncore mutation `notes/togglePin`.
   */
  readonly "notes/togglePin": typeof notes__togglePin;
  /**
   * Runtime definition for the public Syncore mutation `notes/update`.
   */
  readonly "notes/update": typeof notes__update;
}

/**
 * The runtime registry for every function exported from `syncore/functions`.
 *
 * Most application code should import from `./api` instead of using this map directly.
 */
const rootFunctions: SyncoreRootFunctionsRegistry = {
  "notes/list": notes__list,
  "notes/get": notes__get,
  "notes/search": notes__search,
  "notes/create": notes__create,
  "notes/update": notes__update,
  "notes/togglePin": notes__togglePin,
  "notes/remove": notes__remove,
  "notes/scheduleAutoSave": notes__scheduleAutoSave,
} as const;

export const functions: SyncoreFunctionRegistry = composeProjectFunctionRegistry(rootFunctions, componentsManifest);
