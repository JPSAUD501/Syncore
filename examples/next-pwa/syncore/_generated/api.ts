import { createFunctionReferenceFor } from "syncore";
import type { create as todos__create } from "../functions/todos";
import type { list as todos__list } from "../functions/todos";
import type { toggle as todos__toggle } from "../functions/todos";

export const api = { "todos": { "list": createFunctionReferenceFor<typeof todos__list>("query", "todos/list"), "create": createFunctionReferenceFor<typeof todos__create>("mutation", "todos/create"), "toggle": createFunctionReferenceFor<typeof todos__toggle>("mutation", "todos/toggle") } } as const;
