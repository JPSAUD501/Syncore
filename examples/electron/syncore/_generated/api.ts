import { createFunctionReferenceFor } from "syncore";
import type { create as tasks__create } from "../functions/tasks.js";
import type { list as tasks__list } from "../functions/tasks.js";
import type { toggleDone as tasks__toggleDone } from "../functions/tasks.js";

export const api = { "tasks": { "list": createFunctionReferenceFor<typeof tasks__list>("query", "tasks/list"), "create": createFunctionReferenceFor<typeof tasks__create>("mutation", "tasks/create"), "toggleDone": createFunctionReferenceFor<typeof tasks__toggleDone>("mutation", "tasks/toggleDone") } } as const;
