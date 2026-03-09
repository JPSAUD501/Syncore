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
import type { create as todos__create } from "../functions/todos";
import type { list as todos__list } from "../functions/todos";

/**
 * Type-safe references to functions exported from `syncore/functions/todos.ts`.
 */
export interface SyncoreApi__todos {
  /**
   * Reference to the public Syncore mutation `todos/create`.
   */
  readonly create: FunctionReferenceFor<typeof todos__create>;
  /**
   * Reference to the public Syncore query `todos/list`.
   */
  readonly list: FunctionReferenceFor<typeof todos__list>;
}
/**
 * Type-safe references to every public Syncore function in this app.
 */
export interface SyncoreApi {
  /**
   * Functions exported from `syncore/functions/todos.ts`.
   */
  readonly todos: SyncoreApi__todos;
}

/**
 * A utility for referencing Syncore functions in your app's public API.
 *
 * Usage:
 * ```ts
 * const listTasks = api.tasks.list;
 * ```
 */
export const api: SyncoreApi = { todos: { create: createFunctionReferenceFor<typeof todos__create>("mutation", "todos/create"), list: createFunctionReferenceFor<typeof todos__list>("query", "todos/list") } } as const;
