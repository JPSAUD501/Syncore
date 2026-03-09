/**
 * Generated Syncore function registry.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx syncore dev` or `npx syncore codegen`.
 * @module
 */

import type { SyncoreFunctionRegistry } from "syncore";

import { create as notes__create } from "../functions/notes";
import { createFromScheduler as notes__createFromScheduler } from "../functions/notes";
import { list as notes__list } from "../functions/notes";
import { resetAll as notes__resetAll } from "../functions/notes";
import { scheduleCreateCatchUp as notes__scheduleCreateCatchUp } from "../functions/notes";
import { scheduleCreateSkip as notes__scheduleCreateSkip } from "../functions/notes";
import { togglePinned as notes__togglePinned } from "../functions/notes";

/**
 * Type-safe runtime definitions for every function exported from `syncore/functions`.
 */
export interface SyncoreFunctionsRegistry extends SyncoreFunctionRegistry {
  /**
   * Runtime definition for the public Syncore mutation `notes/create`.
   */
  readonly "notes/create": typeof notes__create;
  /**
   * Runtime definition for the public Syncore mutation `notes/createFromScheduler`.
   */
  readonly "notes/createFromScheduler": typeof notes__createFromScheduler;
  /**
   * Runtime definition for the public Syncore query `notes/list`.
   */
  readonly "notes/list": typeof notes__list;
  /**
   * Runtime definition for the public Syncore mutation `notes/resetAll`.
   */
  readonly "notes/resetAll": typeof notes__resetAll;
  /**
   * Runtime definition for the public Syncore mutation `notes/scheduleCreateCatchUp`.
   */
  readonly "notes/scheduleCreateCatchUp": typeof notes__scheduleCreateCatchUp;
  /**
   * Runtime definition for the public Syncore mutation `notes/scheduleCreateSkip`.
   */
  readonly "notes/scheduleCreateSkip": typeof notes__scheduleCreateSkip;
  /**
   * Runtime definition for the public Syncore mutation `notes/togglePinned`.
   */
  readonly "notes/togglePinned": typeof notes__togglePinned;
}

/**
 * The runtime registry for every function exported from `syncore/functions`.
 *
 * Most application code should import from `./api` instead of using this map directly.
 */
export const functions: SyncoreFunctionsRegistry = {
  "notes/list": notes__list,
  "notes/create": notes__create,
  "notes/togglePinned": notes__togglePinned,
  "notes/resetAll": notes__resetAll,
  "notes/createFromScheduler": notes__createFromScheduler,
  "notes/scheduleCreateCatchUp": notes__scheduleCreateCatchUp,
  "notes/scheduleCreateSkip": notes__scheduleCreateSkip,
} as const;
