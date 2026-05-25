/**
 * Generated utilities for implementing Syncore query, mutation, and action functions.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx syncorejs dev` or `npx syncorejs codegen`.
 * @module
 */

import type schema from "../schema";
import { action as baseAction, mutation as baseMutation, query as baseQuery } from "syncorejs";
import type {
  ActionCtx as BaseActionCtx,
  FunctionConfig,
  Infer,
  InferArgs,
  MutationCtx as BaseMutationCtx,
  QueryCtx as BaseQueryCtx,
  SyncoreFunctionDefinition,
  Validator,
  ValidatorMap
} from "syncorejs";

export { createFunctionReference, createFunctionReferenceFor, s } from "syncorejs";

/**
 * The context object available inside Syncore query handlers in this app.
 */
export type QueryCtx = BaseQueryCtx<typeof schema>;

/**
 * The context object available inside Syncore mutation handlers in this app.
 */
export type MutationCtx = BaseMutationCtx<typeof schema>;

/**
 * The context object available inside Syncore action handlers in this app.
 */
export type ActionCtx = BaseActionCtx<typeof schema>;

export type { FunctionReference } from "syncorejs";

/**
 * Define a query in this Syncore app's public API.
 *
 * Queries can read from your local Syncore database and can be called from clients.
 *
 * @param config - The query definition, including args and a handler.
 * @returns The wrapped query. Export it from `syncore/functions` to add it to the generated API.
 */
export const query = baseQuery as {
  <TValidator extends Validator<unknown, unknown, string>, TResult>(
    config: FunctionConfig<QueryCtx, Infer<TValidator>, TResult> & { args: TValidator }
  ): SyncoreFunctionDefinition<"query", QueryCtx, Infer<TValidator>, TResult>;
  <TArgsShape extends ValidatorMap, TResult>(
    config: FunctionConfig<QueryCtx, InferArgs<TArgsShape>, TResult> & { args: TArgsShape }
  ): SyncoreFunctionDefinition<"query", QueryCtx, InferArgs<TArgsShape>, TResult>;
};

/**
 * Define a mutation in this Syncore app's public API.
 *
 * Mutations can write to your local Syncore database and can be called from clients.
 *
 * @param config - The mutation definition, including args and a handler.
 * @returns The wrapped mutation. Export it from `syncore/functions` to add it to the generated API.
 */
export const mutation = baseMutation as {
  <TValidator extends Validator<unknown, unknown, string>, TResult>(
    config: FunctionConfig<MutationCtx, Infer<TValidator>, TResult> & { args: TValidator }
  ): SyncoreFunctionDefinition<"mutation", MutationCtx, Infer<TValidator>, TResult>;
  <TArgsShape extends ValidatorMap, TResult>(
    config: FunctionConfig<MutationCtx, InferArgs<TArgsShape>, TResult> & { args: TArgsShape }
  ): SyncoreFunctionDefinition<"mutation", MutationCtx, InferArgs<TArgsShape>, TResult>;
};

/**
 * Define an action in this Syncore app's public API.
 *
 * Actions can run arbitrary JavaScript and may call queries or mutations.
 *
 * @param config - The action definition, including args and a handler.
 * @returns The wrapped action. Export it from `syncore/functions` to add it to the generated API.
 */
export const action = baseAction as {
  <TValidator extends Validator<unknown, unknown, string>, TResult>(
    config: FunctionConfig<ActionCtx, Infer<TValidator>, TResult> & { args: TValidator }
  ): SyncoreFunctionDefinition<"action", ActionCtx, Infer<TValidator>, TResult>;
  <TArgsShape extends ValidatorMap, TResult>(
    config: FunctionConfig<ActionCtx, InferArgs<TArgsShape>, TResult> & { args: TArgsShape }
  ): SyncoreFunctionDefinition<"action", ActionCtx, InferArgs<TArgsShape>, TResult>;
};
