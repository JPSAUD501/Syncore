import type schema from "../schema.js";
import { action as baseAction, mutation as baseMutation, query as baseQuery } from "syncore";
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
} from "syncore";

export { createFunctionReference, createFunctionReferenceFor, v } from "syncore";
export type QueryCtx = BaseQueryCtx<typeof schema>;
export type MutationCtx = BaseMutationCtx<typeof schema>;
export type ActionCtx = BaseActionCtx<typeof schema>;
export type { FunctionReference } from "syncore";

export function query<TValidator extends Validator<unknown>, TResult>(
  config: FunctionConfig<QueryCtx, Infer<TValidator>, TResult> & { args: TValidator }
): SyncoreFunctionDefinition<"query", QueryCtx, Infer<TValidator>, TResult>;
export function query<TArgsShape extends ValidatorMap, TResult>(
  config: FunctionConfig<QueryCtx, InferArgs<TArgsShape>, TResult> & { args: TArgsShape }
): SyncoreFunctionDefinition<"query", QueryCtx, InferArgs<TArgsShape>, TResult>;
export function query<TArgsShape extends Validator<unknown> | ValidatorMap, TResult>(
  config: FunctionConfig<QueryCtx, InferArgs<TArgsShape>, TResult> & { args: TArgsShape }
) {
  return baseQuery(config as never) as SyncoreFunctionDefinition<
    "query",
    QueryCtx,
    InferArgs<TArgsShape>,
    TResult
  >;
}

export function mutation<TValidator extends Validator<unknown>, TResult>(
  config: FunctionConfig<MutationCtx, Infer<TValidator>, TResult> & { args: TValidator }
): SyncoreFunctionDefinition<"mutation", MutationCtx, Infer<TValidator>, TResult>;
export function mutation<TArgsShape extends ValidatorMap, TResult>(
  config: FunctionConfig<MutationCtx, InferArgs<TArgsShape>, TResult> & { args: TArgsShape }
): SyncoreFunctionDefinition<"mutation", MutationCtx, InferArgs<TArgsShape>, TResult>;
export function mutation<TArgsShape extends Validator<unknown> | ValidatorMap, TResult>(
  config: FunctionConfig<MutationCtx, InferArgs<TArgsShape>, TResult> & { args: TArgsShape }
) {
  return baseMutation(config as never) as SyncoreFunctionDefinition<
    "mutation",
    MutationCtx,
    InferArgs<TArgsShape>,
    TResult
  >;
}

export function action<TValidator extends Validator<unknown>, TResult>(
  config: FunctionConfig<ActionCtx, Infer<TValidator>, TResult> & { args: TValidator }
): SyncoreFunctionDefinition<"action", ActionCtx, Infer<TValidator>, TResult>;
export function action<TArgsShape extends ValidatorMap, TResult>(
  config: FunctionConfig<ActionCtx, InferArgs<TArgsShape>, TResult> & { args: TArgsShape }
): SyncoreFunctionDefinition<"action", ActionCtx, InferArgs<TArgsShape>, TResult>;
export function action<TArgsShape extends Validator<unknown> | ValidatorMap, TResult>(
  config: FunctionConfig<ActionCtx, InferArgs<TArgsShape>, TResult> & { args: TArgsShape }
) {
  return baseAction(config as never) as SyncoreFunctionDefinition<
    "action",
    ActionCtx,
    InferArgs<TArgsShape>,
    TResult
  >;
}
