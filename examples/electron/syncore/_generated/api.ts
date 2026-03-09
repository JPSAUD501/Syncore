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
import type { create as tasks__create } from "../functions/tasks.js";
import type { list as tasks__list } from "../functions/tasks.js";
import type { toggleDone as tasks__toggleDone } from "../functions/tasks.js";

/**
 * Type-safe references to functions exported from `syncore/functions/tasks.ts`.
 */
export interface SyncoreApi__tasks {
  /**
   * Reference to the public Syncore mutation `tasks/create`.
   */
  readonly create: FunctionReferenceFor<typeof tasks__create>;
  /**
   * Reference to the public Syncore query `tasks/list`.
   */
  readonly list: FunctionReferenceFor<typeof tasks__list>;
  /**
   * Reference to the public Syncore mutation `tasks/toggleDone`.
   */
  readonly toggleDone: FunctionReferenceFor<typeof tasks__toggleDone>;
}
/**
 * Type-safe references to every public Syncore function in this app.
 */
export interface SyncoreApi {
  /**
   * Functions exported from `syncore/functions/tasks.ts`.
   */
  readonly tasks: SyncoreApi__tasks;
}

/**
 * A utility for referencing Syncore functions in your app's public API.
 *
 * Usage:
 * ```ts
 * const listTasks = api.tasks.list;
 * ```
 */
export const api: SyncoreApi = { tasks: { create: createFunctionReferenceFor<typeof tasks__create>("mutation", "tasks/create"), list: createFunctionReferenceFor<typeof tasks__list>("query", "tasks/list"), toggleDone: createFunctionReferenceFor<typeof tasks__toggleDone>("mutation", "tasks/toggleDone") } } as const;
