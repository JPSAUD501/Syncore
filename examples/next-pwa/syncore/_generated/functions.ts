/**
 * Generated Syncore function registry.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx syncorejs dev` or `npx syncorejs codegen`.
 * @module
 */

import type { SyncoreFunctionRegistry } from "syncorejs";

import { createRecord as artifacts__createRecord } from "../functions/artifacts";
import { generate as artifacts__generate } from "../functions/artifacts";
import { getContent as artifacts__getContent } from "../functions/artifacts";
import { listByTask as artifacts__listByTask } from "../functions/artifacts";
import { remove as artifacts__remove } from "../functions/artifacts";
import { archive as projects__archive } from "../functions/projects";
import { create as projects__create } from "../functions/projects";
import { list as projects__list } from "../functions/projects";
import { update as projects__update } from "../functions/projects";
import { complete as tasks__complete } from "../functions/tasks";
import { create as tasks__create } from "../functions/tasks";
import { get as tasks__get } from "../functions/tasks";
import { move as tasks__move } from "../functions/tasks";
import { remove as tasks__remove } from "../functions/tasks";
import { reopen as tasks__reopen } from "../functions/tasks";
import { scheduleReminder as tasks__scheduleReminder } from "../functions/tasks";
import { search as tasks__search } from "../functions/tasks";
import { seedDemo as tasks__seedDemo } from "../functions/tasks";
import { triggerReminder as tasks__triggerReminder } from "../functions/tasks";
import { update as tasks__update } from "../functions/tasks";
import { workspace as tasks__workspace } from "../functions/tasks";

/**
 * Type-safe runtime definitions for every function exported from `syncore/functions`.
 */
export interface SyncoreFunctionsRegistry extends SyncoreFunctionRegistry {
  /**
   * Runtime definition for the public Syncore mutation `artifacts/createRecord`.
   */
  readonly "artifacts/createRecord": typeof artifacts__createRecord;
  /**
   * Runtime definition for the public Syncore action `artifacts/generate`.
   */
  readonly "artifacts/generate": typeof artifacts__generate;
  /**
   * Runtime definition for the public Syncore query `artifacts/getContent`.
   */
  readonly "artifacts/getContent": typeof artifacts__getContent;
  /**
   * Runtime definition for the public Syncore query `artifacts/listByTask`.
   */
  readonly "artifacts/listByTask": typeof artifacts__listByTask;
  /**
   * Runtime definition for the public Syncore mutation `artifacts/remove`.
   */
  readonly "artifacts/remove": typeof artifacts__remove;
  /**
   * Runtime definition for the public Syncore mutation `projects/archive`.
   */
  readonly "projects/archive": typeof projects__archive;
  /**
   * Runtime definition for the public Syncore mutation `projects/create`.
   */
  readonly "projects/create": typeof projects__create;
  /**
   * Runtime definition for the public Syncore query `projects/list`.
   */
  readonly "projects/list": typeof projects__list;
  /**
   * Runtime definition for the public Syncore mutation `projects/update`.
   */
  readonly "projects/update": typeof projects__update;
  /**
   * Runtime definition for the public Syncore mutation `tasks/complete`.
   */
  readonly "tasks/complete": typeof tasks__complete;
  /**
   * Runtime definition for the public Syncore mutation `tasks/create`.
   */
  readonly "tasks/create": typeof tasks__create;
  /**
   * Runtime definition for the public Syncore query `tasks/get`.
   */
  readonly "tasks/get": typeof tasks__get;
  /**
   * Runtime definition for the public Syncore mutation `tasks/move`.
   */
  readonly "tasks/move": typeof tasks__move;
  /**
   * Runtime definition for the public Syncore mutation `tasks/remove`.
   */
  readonly "tasks/remove": typeof tasks__remove;
  /**
   * Runtime definition for the public Syncore mutation `tasks/reopen`.
   */
  readonly "tasks/reopen": typeof tasks__reopen;
  /**
   * Runtime definition for the public Syncore mutation `tasks/scheduleReminder`.
   */
  readonly "tasks/scheduleReminder": typeof tasks__scheduleReminder;
  /**
   * Runtime definition for the public Syncore query `tasks/search`.
   */
  readonly "tasks/search": typeof tasks__search;
  /**
   * Runtime definition for the public Syncore mutation `tasks/seedDemo`.
   */
  readonly "tasks/seedDemo": typeof tasks__seedDemo;
  /**
   * Runtime definition for the public Syncore mutation `tasks/triggerReminder`.
   */
  readonly "tasks/triggerReminder": typeof tasks__triggerReminder;
  /**
   * Runtime definition for the public Syncore mutation `tasks/update`.
   */
  readonly "tasks/update": typeof tasks__update;
  /**
   * Runtime definition for the public Syncore query `tasks/workspace`.
   */
  readonly "tasks/workspace": typeof tasks__workspace;
}

/**
 * The runtime registry for every function exported from `syncore/functions`.
 *
 * Most application code should import from `./api` instead of using this map directly.
 */
export const functions: SyncoreFunctionsRegistry = {
  "artifacts/listByTask": artifacts__listByTask,
  "artifacts/getContent": artifacts__getContent,
  "artifacts/createRecord": artifacts__createRecord,
  "artifacts/remove": artifacts__remove,
  "artifacts/generate": artifacts__generate,
  "projects/list": projects__list,
  "projects/create": projects__create,
  "projects/update": projects__update,
  "projects/archive": projects__archive,
  "tasks/workspace": tasks__workspace,
  "tasks/get": tasks__get,
  "tasks/search": tasks__search,
  "tasks/create": tasks__create,
  "tasks/update": tasks__update,
  "tasks/move": tasks__move,
  "tasks/complete": tasks__complete,
  "tasks/reopen": tasks__reopen,
  "tasks/scheduleReminder": tasks__scheduleReminder,
  "tasks/triggerReminder": tasks__triggerReminder,
  "tasks/remove": tasks__remove,
  "tasks/seedDemo": tasks__seedDemo,
} as const;
