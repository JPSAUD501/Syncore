import { createFunctionReferenceFor } from "syncore";
import type { create as notes__create } from "../functions/notes";
import type { createFromScheduler as notes__createFromScheduler } from "../functions/notes";
import type { list as notes__list } from "../functions/notes";
import type { resetAll as notes__resetAll } from "../functions/notes";
import type { scheduleCreateCatchUp as notes__scheduleCreateCatchUp } from "../functions/notes";
import type { scheduleCreateSkip as notes__scheduleCreateSkip } from "../functions/notes";
import type { togglePinned as notes__togglePinned } from "../functions/notes";

export const api = { "notes": { "list": createFunctionReferenceFor<typeof notes__list>("query", "notes/list"), "create": createFunctionReferenceFor<typeof notes__create>("mutation", "notes/create"), "togglePinned": createFunctionReferenceFor<typeof notes__togglePinned>("mutation", "notes/togglePinned"), "resetAll": createFunctionReferenceFor<typeof notes__resetAll>("mutation", "notes/resetAll"), "createFromScheduler": createFunctionReferenceFor<typeof notes__createFromScheduler>("mutation", "notes/createFromScheduler"), "scheduleCreateCatchUp": createFunctionReferenceFor<typeof notes__scheduleCreateCatchUp>("mutation", "notes/scheduleCreateCatchUp"), "scheduleCreateSkip": createFunctionReferenceFor<typeof notes__scheduleCreateSkip>("mutation", "notes/scheduleCreateSkip") } } as const;
