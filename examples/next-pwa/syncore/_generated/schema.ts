/**
 * Generated composed Syncore schema including installed components.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx syncorejs dev` or `npx syncorejs codegen`.
 * @module
 */

import type { AnyTableDefinition, SyncoreSchema } from "syncorejs";
import { composeProjectSchema } from "syncorejs";
import rootSchema from "../schema";

const componentsManifest = {} as const;

const schema: SyncoreSchema<Record<string, AnyTableDefinition>> = composeProjectSchema(rootSchema as never, componentsManifest);

export default schema;
