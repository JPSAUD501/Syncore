/**
 * Generated composed Syncore schema including installed components.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx syncorejs dev` or `npx syncorejs codegen`.
 * @module
 */

import { composeProjectSchema } from "syncorejs";
import rootSchema from "../schema.js";

const componentsManifest = {} as const;

const schema = composeProjectSchema(rootSchema, componentsManifest);

export default schema;
