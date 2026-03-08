import { create as todos__create } from "../functions/todos";
import { list as todos__list } from "../functions/todos";
import { toggle as todos__toggle } from "../functions/todos";

export const functions = {
  "todos/list": todos__list,
  "todos/create": todos__create,
  "todos/toggle": todos__toggle,
} as const;
