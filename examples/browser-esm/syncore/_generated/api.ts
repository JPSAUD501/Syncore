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
export { components } from "./components";

import type { attachFile as contacts__attachFile } from "../functions/contacts";
import type { create as contacts__create } from "../functions/contacts";
import type { list as contacts__list } from "../functions/contacts";
import type { listAttachments as contacts__listAttachments } from "../functions/contacts";
import type { remove as contacts__remove } from "../functions/contacts";
import type { removeAttachment as contacts__removeAttachment } from "../functions/contacts";
import type { search as contacts__search } from "../functions/contacts";
import type { seedDemo as contacts__seedDemo } from "../functions/contacts";
import type { stats as contacts__stats } from "../functions/contacts";
import type { toggleFavorite as contacts__toggleFavorite } from "../functions/contacts";

/**
 * Type-safe references to functions exported from `syncore/functions/contacts.ts`.
 */
export interface SyncoreApi__contacts {
  /**
   * Reference to the public Syncore mutation `contacts/attachFile`.
   */
  readonly attachFile: FunctionReferenceFor<typeof contacts__attachFile>;
  /**
   * Reference to the public Syncore mutation `contacts/create`.
   */
  readonly create: FunctionReferenceFor<typeof contacts__create>;
  /**
   * Reference to the public Syncore query `contacts/list`.
   */
  readonly list: FunctionReferenceFor<typeof contacts__list>;
  /**
   * Reference to the public Syncore query `contacts/listAttachments`.
   */
  readonly listAttachments: FunctionReferenceFor<typeof contacts__listAttachments>;
  /**
   * Reference to the public Syncore mutation `contacts/remove`.
   */
  readonly remove: FunctionReferenceFor<typeof contacts__remove>;
  /**
   * Reference to the public Syncore mutation `contacts/removeAttachment`.
   */
  readonly removeAttachment: FunctionReferenceFor<typeof contacts__removeAttachment>;
  /**
   * Reference to the public Syncore query `contacts/search`.
   */
  readonly search: FunctionReferenceFor<typeof contacts__search>;
  /**
   * Reference to the public Syncore mutation `contacts/seedDemo`.
   */
  readonly seedDemo: FunctionReferenceFor<typeof contacts__seedDemo>;
  /**
   * Reference to the public Syncore query `contacts/stats`.
   */
  readonly stats: FunctionReferenceFor<typeof contacts__stats>;
  /**
   * Reference to the public Syncore mutation `contacts/toggleFavorite`.
   */
  readonly toggleFavorite: FunctionReferenceFor<typeof contacts__toggleFavorite>;
}
/**
 * Type-safe references to every public Syncore function in this app.
 */
export interface SyncoreApi {
  /**
   * Functions exported from `syncore/functions/contacts.ts`.
   */
  readonly contacts: SyncoreApi__contacts;
}

/**
 * A utility for referencing Syncore functions in your app's public API.
 *
 * Usage:
 * ```ts
 * const listTasks = api.tasks.list;
 * ```
 */
export const api: SyncoreApi = { contacts: { attachFile: createFunctionReferenceFor<typeof contacts__attachFile>("mutation", "contacts/attachFile"), create: createFunctionReferenceFor<typeof contacts__create>("mutation", "contacts/create"), list: createFunctionReferenceFor<typeof contacts__list>("query", "contacts/list"), listAttachments: createFunctionReferenceFor<typeof contacts__listAttachments>("query", "contacts/listAttachments"), remove: createFunctionReferenceFor<typeof contacts__remove>("mutation", "contacts/remove"), removeAttachment: createFunctionReferenceFor<typeof contacts__removeAttachment>("mutation", "contacts/removeAttachment"), search: createFunctionReferenceFor<typeof contacts__search>("query", "contacts/search"), seedDemo: createFunctionReferenceFor<typeof contacts__seedDemo>("mutation", "contacts/seedDemo"), stats: createFunctionReferenceFor<typeof contacts__stats>("query", "contacts/stats"), toggleFavorite: createFunctionReferenceFor<typeof contacts__toggleFavorite>("mutation", "contacts/toggleFavorite") } } as const;
