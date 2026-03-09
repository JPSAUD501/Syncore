/**
 * Generated Syncore function registry.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx syncore dev` or `npx syncore codegen`.
 * @module
 */

import type { SyncoreFunctionRegistry } from "syncore";

import { archiveHabit as habits__archiveHabit } from "../functions/habits";
import { completionsForDate as habits__completionsForDate } from "../functions/habits";
import { createHabit as habits__createHabit } from "../functions/habits";
import { listCompletions as habits__listCompletions } from "../functions/habits";
import { listHabits as habits__listHabits } from "../functions/habits";
import { removeHabit as habits__removeHabit } from "../functions/habits";
import { toggleCompletion as habits__toggleCompletion } from "../functions/habits";

/**
 * Type-safe runtime definitions for every function exported from `syncore/functions`.
 */
export interface SyncoreFunctionsRegistry extends SyncoreFunctionRegistry {
  /**
   * Runtime definition for the public Syncore mutation `habits/archiveHabit`.
   */
  readonly "habits/archiveHabit": typeof habits__archiveHabit;
  /**
   * Runtime definition for the public Syncore query `habits/completionsForDate`.
   */
  readonly "habits/completionsForDate": typeof habits__completionsForDate;
  /**
   * Runtime definition for the public Syncore mutation `habits/createHabit`.
   */
  readonly "habits/createHabit": typeof habits__createHabit;
  /**
   * Runtime definition for the public Syncore query `habits/listCompletions`.
   */
  readonly "habits/listCompletions": typeof habits__listCompletions;
  /**
   * Runtime definition for the public Syncore query `habits/listHabits`.
   */
  readonly "habits/listHabits": typeof habits__listHabits;
  /**
   * Runtime definition for the public Syncore mutation `habits/removeHabit`.
   */
  readonly "habits/removeHabit": typeof habits__removeHabit;
  /**
   * Runtime definition for the public Syncore mutation `habits/toggleCompletion`.
   */
  readonly "habits/toggleCompletion": typeof habits__toggleCompletion;
}

/**
 * The runtime registry for every function exported from `syncore/functions`.
 *
 * Most application code should import from `./api` instead of using this map directly.
 */
export const functions: SyncoreFunctionsRegistry = {
  "habits/listHabits": habits__listHabits,
  "habits/listCompletions": habits__listCompletions,
  "habits/completionsForDate": habits__completionsForDate,
  "habits/createHabit": habits__createHabit,
  "habits/toggleCompletion": habits__toggleCompletion,
  "habits/archiveHabit": habits__archiveHabit,
  "habits/removeHabit": habits__removeHabit,
} as const;
