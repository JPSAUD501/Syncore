import { create as tasks__create } from "../functions/tasks.js";
import { list as tasks__list } from "../functions/tasks.js";
import { toggleDone as tasks__toggleDone } from "../functions/tasks.js";

export const functions = {
  "tasks/list": tasks__list,
  "tasks/create": tasks__create,
  "tasks/toggleDone": tasks__toggleDone,
} as const;
