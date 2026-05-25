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
import { archiveHabit as habits__archiveHabit } from "../functions/habits";
import { completionsForDate as habits__completionsForDate } from "../functions/habits";
import { createHabit as habits__createHabit } from "../functions/habits";
import { dashboard as habits__dashboard } from "../functions/habits";
import { listCompletions as habits__listCompletions } from "../functions/habits";
import { listHabits as habits__listHabits } from "../functions/habits";
import { removeHabit as habits__removeHabit } from "../functions/habits";
import { renameHabit as habits__renameHabit } from "../functions/habits";
import { seedDemo as habits__seedDemo } from "../functions/habits";
import { toggleCompletion as habits__toggleCompletion } from "../functions/habits";

const componentsManifest = {} as const;

/**
 * Type-safe runtime definitions for every function exported from `syncore/functions`.
 */
export interface SyncoreRootFunctionsRegistry extends SyncoreFunctionRegistry {
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
   * Runtime definition for the public Syncore query `habits/dashboard`.
   */
  readonly "habits/dashboard": typeof habits__dashboard;
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
   * Runtime definition for the public Syncore mutation `habits/renameHabit`.
   */
  readonly "habits/renameHabit": typeof habits__renameHabit;
  /**
   * Runtime definition for the public Syncore mutation `habits/seedDemo`.
   */
  readonly "habits/seedDemo": typeof habits__seedDemo;
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
const rootFunctions: SyncoreRootFunctionsRegistry = {
  "habits/listHabits": habits__listHabits,
  "habits/listCompletions": habits__listCompletions,
  "habits/dashboard": habits__dashboard,
  "habits/completionsForDate": habits__completionsForDate,
  "habits/createHabit": habits__createHabit,
  "habits/renameHabit": habits__renameHabit,
  "habits/toggleCompletion": habits__toggleCompletion,
  "habits/archiveHabit": habits__archiveHabit,
  "habits/seedDemo": habits__seedDemo,
  "habits/removeHabit": habits__removeHabit,
} as const;

export const functions: SyncoreFunctionRegistry = composeProjectFunctionRegistry(rootFunctions, componentsManifest);
