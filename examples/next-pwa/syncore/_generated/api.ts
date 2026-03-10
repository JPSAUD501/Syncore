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
import type { createRecord as artifacts__createRecord } from "../functions/artifacts";
import type { generate as artifacts__generate } from "../functions/artifacts";
import type { getContent as artifacts__getContent } from "../functions/artifacts";
import type { listByTask as artifacts__listByTask } from "../functions/artifacts";
import type { remove as artifacts__remove } from "../functions/artifacts";
import type { archive as projects__archive } from "../functions/projects";
import type { create as projects__create } from "../functions/projects";
import type { list as projects__list } from "../functions/projects";
import type { update as projects__update } from "../functions/projects";
import type { complete as tasks__complete } from "../functions/tasks";
import type { create as tasks__create } from "../functions/tasks";
import type { get as tasks__get } from "../functions/tasks";
import type { move as tasks__move } from "../functions/tasks";
import type { remove as tasks__remove } from "../functions/tasks";
import type { reopen as tasks__reopen } from "../functions/tasks";
import type { scheduleReminder as tasks__scheduleReminder } from "../functions/tasks";
import type { search as tasks__search } from "../functions/tasks";
import type { seedDemo as tasks__seedDemo } from "../functions/tasks";
import type { triggerReminder as tasks__triggerReminder } from "../functions/tasks";
import type { update as tasks__update } from "../functions/tasks";
import type { workspace as tasks__workspace } from "../functions/tasks";

/**
 * Type-safe references to functions exported from `syncore/functions/artifacts.ts`.
 */
export interface SyncoreApi__artifacts {
  /**
   * Reference to the public Syncore mutation `artifacts/createRecord`.
   */
  readonly createRecord: FunctionReferenceFor<typeof artifacts__createRecord>;
  /**
   * Reference to the public Syncore action `artifacts/generate`.
   */
  readonly generate: FunctionReferenceFor<typeof artifacts__generate>;
  /**
   * Reference to the public Syncore query `artifacts/getContent`.
   */
  readonly getContent: FunctionReferenceFor<typeof artifacts__getContent>;
  /**
   * Reference to the public Syncore query `artifacts/listByTask`.
   */
  readonly listByTask: FunctionReferenceFor<typeof artifacts__listByTask>;
  /**
   * Reference to the public Syncore mutation `artifacts/remove`.
   */
  readonly remove: FunctionReferenceFor<typeof artifacts__remove>;
}
/**
 * Type-safe references to functions exported from `syncore/functions/projects.ts`.
 */
export interface SyncoreApi__projects {
  /**
   * Reference to the public Syncore mutation `projects/archive`.
   */
  readonly archive: FunctionReferenceFor<typeof projects__archive>;
  /**
   * Reference to the public Syncore mutation `projects/create`.
   */
  readonly create: FunctionReferenceFor<typeof projects__create>;
  /**
   * Reference to the public Syncore query `projects/list`.
   */
  readonly list: FunctionReferenceFor<typeof projects__list>;
  /**
   * Reference to the public Syncore mutation `projects/update`.
   */
  readonly update: FunctionReferenceFor<typeof projects__update>;
}
/**
 * Type-safe references to functions exported from `syncore/functions/tasks.ts`.
 */
export interface SyncoreApi__tasks {
  /**
   * Reference to the public Syncore mutation `tasks/complete`.
   */
  readonly complete: FunctionReferenceFor<typeof tasks__complete>;
  /**
   * Reference to the public Syncore mutation `tasks/create`.
   */
  readonly create: FunctionReferenceFor<typeof tasks__create>;
  /**
   * Reference to the public Syncore query `tasks/get`.
   */
  readonly get: FunctionReferenceFor<typeof tasks__get>;
  /**
   * Reference to the public Syncore mutation `tasks/move`.
   */
  readonly move: FunctionReferenceFor<typeof tasks__move>;
  /**
   * Reference to the public Syncore mutation `tasks/remove`.
   */
  readonly remove: FunctionReferenceFor<typeof tasks__remove>;
  /**
   * Reference to the public Syncore mutation `tasks/reopen`.
   */
  readonly reopen: FunctionReferenceFor<typeof tasks__reopen>;
  /**
   * Reference to the public Syncore mutation `tasks/scheduleReminder`.
   */
  readonly scheduleReminder: FunctionReferenceFor<typeof tasks__scheduleReminder>;
  /**
   * Reference to the public Syncore query `tasks/search`.
   */
  readonly search: FunctionReferenceFor<typeof tasks__search>;
  /**
   * Reference to the public Syncore mutation `tasks/seedDemo`.
   */
  readonly seedDemo: FunctionReferenceFor<typeof tasks__seedDemo>;
  /**
   * Reference to the public Syncore mutation `tasks/triggerReminder`.
   */
  readonly triggerReminder: FunctionReferenceFor<typeof tasks__triggerReminder>;
  /**
   * Reference to the public Syncore mutation `tasks/update`.
   */
  readonly update: FunctionReferenceFor<typeof tasks__update>;
  /**
   * Reference to the public Syncore query `tasks/workspace`.
   */
  readonly workspace: FunctionReferenceFor<typeof tasks__workspace>;
}
/**
 * Type-safe references to every public Syncore function in this app.
 */
export interface SyncoreApi {
  /**
   * Functions exported from `syncore/functions/artifacts.ts`.
   */
  readonly artifacts: SyncoreApi__artifacts;
  /**
   * Functions exported from `syncore/functions/projects.ts`.
   */
  readonly projects: SyncoreApi__projects;
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
export const api: SyncoreApi = { artifacts: { createRecord: createFunctionReferenceFor<typeof artifacts__createRecord>("mutation", "artifacts/createRecord"), generate: createFunctionReferenceFor<typeof artifacts__generate>("action", "artifacts/generate"), getContent: createFunctionReferenceFor<typeof artifacts__getContent>("query", "artifacts/getContent"), listByTask: createFunctionReferenceFor<typeof artifacts__listByTask>("query", "artifacts/listByTask"), remove: createFunctionReferenceFor<typeof artifacts__remove>("mutation", "artifacts/remove") }, projects: { archive: createFunctionReferenceFor<typeof projects__archive>("mutation", "projects/archive"), create: createFunctionReferenceFor<typeof projects__create>("mutation", "projects/create"), list: createFunctionReferenceFor<typeof projects__list>("query", "projects/list"), update: createFunctionReferenceFor<typeof projects__update>("mutation", "projects/update") }, tasks: { complete: createFunctionReferenceFor<typeof tasks__complete>("mutation", "tasks/complete"), create: createFunctionReferenceFor<typeof tasks__create>("mutation", "tasks/create"), get: createFunctionReferenceFor<typeof tasks__get>("query", "tasks/get"), move: createFunctionReferenceFor<typeof tasks__move>("mutation", "tasks/move"), remove: createFunctionReferenceFor<typeof tasks__remove>("mutation", "tasks/remove"), reopen: createFunctionReferenceFor<typeof tasks__reopen>("mutation", "tasks/reopen"), scheduleReminder: createFunctionReferenceFor<typeof tasks__scheduleReminder>("mutation", "tasks/scheduleReminder"), search: createFunctionReferenceFor<typeof tasks__search>("query", "tasks/search"), seedDemo: createFunctionReferenceFor<typeof tasks__seedDemo>("mutation", "tasks/seedDemo"), triggerReminder: createFunctionReferenceFor<typeof tasks__triggerReminder>("mutation", "tasks/triggerReminder"), update: createFunctionReferenceFor<typeof tasks__update>("mutation", "tasks/update"), workspace: createFunctionReferenceFor<typeof tasks__workspace>("query", "tasks/workspace") } } as const;
