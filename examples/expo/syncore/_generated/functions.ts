import { create as notes__create } from "../functions/notes";
import { createFromScheduler as notes__createFromScheduler } from "../functions/notes";
import { list as notes__list } from "../functions/notes";
import { resetAll as notes__resetAll } from "../functions/notes";
import { scheduleCreateCatchUp as notes__scheduleCreateCatchUp } from "../functions/notes";
import { scheduleCreateSkip as notes__scheduleCreateSkip } from "../functions/notes";
import { togglePinned as notes__togglePinned } from "../functions/notes";

export const functions = {
  "notes/list": notes__list,
  "notes/create": notes__create,
  "notes/togglePinned": notes__togglePinned,
  "notes/resetAll": notes__resetAll,
  "notes/createFromScheduler": notes__createFromScheduler,
  "notes/scheduleCreateCatchUp": notes__scheduleCreateCatchUp,
  "notes/scheduleCreateSkip": notes__scheduleCreateSkip,
} as const;
