/**
 * Generated `api` utility for referencing Syncore functions.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx syncorejs dev` or `npx syncorejs codegen`.
 * @module
 */

import { createFunctionReferenceFor } from "syncorejs";
import type { FunctionReferenceFor } from "syncorejs";
export { components } from "./components";

import type { archiveHabit as habits__archiveHabit } from "../functions/habits";
import type { completionsForDate as habits__completionsForDate } from "../functions/habits";
import type { createHabit as habits__createHabit } from "../functions/habits";
import type { listCompletions as habits__listCompletions } from "../functions/habits";
import type { listHabits as habits__listHabits } from "../functions/habits";
import type { removeHabit as habits__removeHabit } from "../functions/habits";
import type { toggleCompletion as habits__toggleCompletion } from "../functions/habits";

/**
 * Type-safe references to functions exported from `syncore/functions/habits.ts`.
 */
export interface SyncoreApi__habits {
  /**
   * Reference to the public Syncore mutation `habits/archiveHabit`.
   */
  readonly archiveHabit: FunctionReferenceFor<typeof habits__archiveHabit>;
  /**
   * Reference to the public Syncore query `habits/completionsForDate`.
   */
  readonly completionsForDate: FunctionReferenceFor<typeof habits__completionsForDate>;
  /**
   * Reference to the public Syncore mutation `habits/createHabit`.
   */
  readonly createHabit: FunctionReferenceFor<typeof habits__createHabit>;
  /**
   * Reference to the public Syncore query `habits/listCompletions`.
   */
  readonly listCompletions: FunctionReferenceFor<typeof habits__listCompletions>;
  /**
   * Reference to the public Syncore query `habits/listHabits`.
   */
  readonly listHabits: FunctionReferenceFor<typeof habits__listHabits>;
  /**
   * Reference to the public Syncore mutation `habits/removeHabit`.
   */
  readonly removeHabit: FunctionReferenceFor<typeof habits__removeHabit>;
  /**
   * Reference to the public Syncore mutation `habits/toggleCompletion`.
   */
  readonly toggleCompletion: FunctionReferenceFor<typeof habits__toggleCompletion>;
}
/**
 * Type-safe references to every public Syncore function in this app.
 */
export interface SyncoreApi {
  /**
   * Functions exported from `syncore/functions/habits.ts`.
   */
  readonly habits: SyncoreApi__habits;
}

/**
 * A utility for referencing Syncore functions in your app's public API.
 *
 * Usage:
 * ```ts
 * const listTasks = api.tasks.list;
 * ```
 */
export const api: SyncoreApi = { habits: { archiveHabit: createFunctionReferenceFor<typeof habits__archiveHabit>("mutation", "habits/archiveHabit"), completionsForDate: createFunctionReferenceFor<typeof habits__completionsForDate>("query", "habits/completionsForDate"), createHabit: createFunctionReferenceFor<typeof habits__createHabit>("mutation", "habits/createHabit"), listCompletions: createFunctionReferenceFor<typeof habits__listCompletions>("query", "habits/listCompletions"), listHabits: createFunctionReferenceFor<typeof habits__listHabits>("query", "habits/listHabits"), removeHabit: createFunctionReferenceFor<typeof habits__removeHabit>("mutation", "habits/removeHabit"), toggleCompletion: createFunctionReferenceFor<typeof habits__toggleCompletion>("mutation", "habits/toggleCompletion") } } as const;
