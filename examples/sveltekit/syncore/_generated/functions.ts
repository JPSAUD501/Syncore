/**
 * Generated Syncore function registry.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx syncore dev` or `npx syncore codegen`.
 * @module
 */

import type { SyncoreFunctionRegistry } from "syncore";

import { create as todos__create } from "../functions/todos";
import { list as todos__list } from "../functions/todos";

/**
 * Type-safe runtime definitions for every function exported from `syncore/functions`.
 */
export interface SyncoreFunctionsRegistry extends SyncoreFunctionRegistry {
  /**
   * Runtime definition for the public Syncore mutation `todos/create`.
   */
  readonly "todos/create": typeof todos__create;
  /**
   * Runtime definition for the public Syncore query `todos/list`.
   */
  readonly "todos/list": typeof todos__list;
}

/**
 * The runtime registry for every function exported from `syncore/functions`.
 *
 * Most application code should import from `./api` instead of using this map directly.
 */
export const functions: SyncoreFunctionsRegistry = {
  "todos/list": todos__list,
  "todos/create": todos__create,
} as const;
