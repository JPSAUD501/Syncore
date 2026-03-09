/**
 * Generated Syncore function registry.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx syncore dev` or `npx syncore codegen`.
 * @module
 */

import type { SyncoreFunctionRegistry } from "syncore";

import { create as tasks__create } from "../functions/tasks.js";
import { list as tasks__list } from "../functions/tasks.js";
import { toggleDone as tasks__toggleDone } from "../functions/tasks.js";

/**
 * Type-safe runtime definitions for every function exported from `syncore/functions`.
 */
export interface SyncoreFunctionsRegistry extends SyncoreFunctionRegistry {
  /**
   * Runtime definition for the public Syncore mutation `tasks/create`.
   */
  readonly "tasks/create": typeof tasks__create;
  /**
   * Runtime definition for the public Syncore query `tasks/list`.
   */
  readonly "tasks/list": typeof tasks__list;
  /**
   * Runtime definition for the public Syncore mutation `tasks/toggleDone`.
   */
  readonly "tasks/toggleDone": typeof tasks__toggleDone;
}

/**
 * The runtime registry for every function exported from `syncore/functions`.
 *
 * Most application code should import from `./api` instead of using this map directly.
 */
export const functions: SyncoreFunctionsRegistry = {
  "tasks/list": tasks__list,
  "tasks/create": tasks__create,
  "tasks/toggleDone": tasks__toggleDone,
} as const;
