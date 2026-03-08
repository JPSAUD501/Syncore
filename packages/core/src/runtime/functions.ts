import {
  ensureObjectValidator,
  type Infer,
  type Validator,
  type ValidatorMap
} from "@syncore/schema";

export type SyncoreFunctionKind = "query" | "mutation" | "action";
export type EmptyArgs = Record<never, never>;

export interface FunctionReference<
  TKind extends SyncoreFunctionKind = SyncoreFunctionKind,
  TArgs = EmptyArgs,
  TResult = unknown
> {
  kind: TKind;
  name: string;
  readonly __args?: TArgs;
  readonly __result?: TResult;
}

export interface SyncoreFunctionDefinition<
  TKind extends SyncoreFunctionKind,
  TContext,
  TArgs,
  TResult
> {
  kind: TKind;
  argsValidator: Validator<TArgs>;
  returnsValidator?: Validator<TResult>;
  handler: (ctx: TContext, args: TArgs) => Promise<TResult> | TResult;
}

export type FunctionArgs<TReference> = TReference extends FunctionReference<
  SyncoreFunctionKind,
  infer TArgs,
  unknown
>
  ? TArgs
  : never;

export type FunctionResult<TReference> = TReference extends FunctionReference<
  SyncoreFunctionKind,
  unknown,
  infer TResult
>
  ? TResult
  : never;

export type FunctionKindFromDefinition<TDefinition> = TDefinition extends {
  kind: infer TKind;
}
  ? Extract<TKind, SyncoreFunctionKind>
  : never;

export type FunctionArgsFromDefinition<TDefinition> =
  TDefinition extends {
    argsValidator: Validator<infer TArgs>;
  }
    ? TArgs
    : never;

export type FunctionResultFromDefinition<TDefinition> =
  TDefinition extends {
    returnsValidator?: Validator<infer TResult>;
  }
    ? TResult
    : never;

export type FunctionReferenceFor<TDefinition> =
  FunctionKindFromDefinition<TDefinition> extends never
    ? never
    : FunctionReference<
        FunctionKindFromDefinition<TDefinition>,
        FunctionArgsFromDefinition<TDefinition>,
        FunctionResultFromDefinition<TDefinition>
      >;

export interface FunctionConfig<TContext, TArgs, TResult> {
  args: Validator<TArgs> | ValidatorMap;
  returns?: Validator<TResult>;
  handler: (ctx: TContext, args: TArgs) => Promise<TResult> | TResult;
}

export type InferArgs<TArgs extends Validator<unknown> | ValidatorMap> =
  TArgs extends Validator<unknown>
    ? Infer<TArgs>
    : TArgs extends ValidatorMap
      ? {
          [TKey in keyof TArgs]: Infer<TArgs[TKey]>;
        }
      : never;

function createFunctionDefinition<
  TKind extends SyncoreFunctionKind,
  TContext,
  TArgsShape extends Validator<unknown> | ValidatorMap,
  TResult
>(
  kind: TKind,
  config: FunctionConfig<TContext, InferArgs<TArgsShape>, TResult> & {
    args: TArgsShape;
  }
): SyncoreFunctionDefinition<TKind, TContext, InferArgs<TArgsShape>, TResult> {
  return {
    kind,
    argsValidator: ensureObjectValidator(config.args) as Validator<InferArgs<TArgsShape>>,
    ...(config.returns ? { returnsValidator: config.returns } : {}),
    handler: config.handler
  };
}

export function query<
  TContext = unknown,
  TValidator extends Validator<unknown> = Validator<unknown>,
  TResult = unknown
>(
  config: FunctionConfig<TContext, Infer<TValidator>, TResult> & {
    args: TValidator;
  }
): SyncoreFunctionDefinition<"query", TContext, Infer<TValidator>, TResult>;
export function query<
  TContext = unknown,
  TArgsShape extends ValidatorMap = ValidatorMap,
  TResult = unknown
>(
  config: FunctionConfig<TContext, InferArgs<TArgsShape>, TResult> & {
    args: TArgsShape;
  }
): SyncoreFunctionDefinition<"query", TContext, InferArgs<TArgsShape>, TResult>;
export function query<
  TContext = unknown,
  TArgsShape extends Validator<unknown> | ValidatorMap = ValidatorMap,
  TResult = unknown
>(
  config: FunctionConfig<TContext, InferArgs<TArgsShape>, TResult> & {
    args: TArgsShape;
  }
): SyncoreFunctionDefinition<"query", TContext, InferArgs<TArgsShape>, TResult> {
  return createFunctionDefinition("query", config);
}

export function mutation<
  TContext = unknown,
  TValidator extends Validator<unknown> = Validator<unknown>,
  TResult = unknown
>(
  config: FunctionConfig<TContext, Infer<TValidator>, TResult> & {
    args: TValidator;
  }
): SyncoreFunctionDefinition<"mutation", TContext, Infer<TValidator>, TResult>;
export function mutation<
  TContext = unknown,
  TArgsShape extends ValidatorMap = ValidatorMap,
  TResult = unknown
>(
  config: FunctionConfig<TContext, InferArgs<TArgsShape>, TResult> & {
    args: TArgsShape;
  }
): SyncoreFunctionDefinition<"mutation", TContext, InferArgs<TArgsShape>, TResult>;
export function mutation<
  TContext = unknown,
  TArgsShape extends Validator<unknown> | ValidatorMap = ValidatorMap,
  TResult = unknown
>(
  config: FunctionConfig<TContext, InferArgs<TArgsShape>, TResult> & {
    args: TArgsShape;
  }
): SyncoreFunctionDefinition<"mutation", TContext, InferArgs<TArgsShape>, TResult> {
  return createFunctionDefinition("mutation", config);
}

export function action<
  TContext = unknown,
  TValidator extends Validator<unknown> = Validator<unknown>,
  TResult = unknown
>(
  config: FunctionConfig<TContext, Infer<TValidator>, TResult> & {
    args: TValidator;
  }
): SyncoreFunctionDefinition<"action", TContext, Infer<TValidator>, TResult>;
export function action<
  TContext = unknown,
  TArgsShape extends ValidatorMap = ValidatorMap,
  TResult = unknown
>(
  config: FunctionConfig<TContext, InferArgs<TArgsShape>, TResult> & {
    args: TArgsShape;
  }
): SyncoreFunctionDefinition<"action", TContext, InferArgs<TArgsShape>, TResult>;
export function action<
  TContext = unknown,
  TArgsShape extends Validator<unknown> | ValidatorMap = ValidatorMap,
  TResult = unknown
>(
  config: FunctionConfig<TContext, InferArgs<TArgsShape>, TResult> & {
    args: TArgsShape;
  }
): SyncoreFunctionDefinition<"action", TContext, InferArgs<TArgsShape>, TResult> {
  return createFunctionDefinition("action", config);
}

export interface RecurringIntervalSchedule {
  type: "interval";
  seconds?: number;
  minutes?: number;
  hours?: number;
}

export interface RecurringDailySchedule {
  type: "daily";
  hour: number;
  minute: number;
  timezone?: string;
}

export interface RecurringWeeklySchedule {
  type: "weekly";
  dayOfWeek:
    | "sunday"
    | "monday"
    | "tuesday"
    | "wednesday"
    | "thursday"
    | "friday"
    | "saturday";
  hour: number;
  minute: number;
  timezone?: string;
}

export type RecurringSchedule =
  | RecurringIntervalSchedule
  | RecurringDailySchedule
  | RecurringWeeklySchedule;

export type MisfirePolicy =
  | { type: "catch_up" }
  | { type: "skip" }
  | { type: "run_once_if_missed" }
  | { type: "windowed"; windowMs: number };

export interface RecurringJobDefinition {
  name: string;
  schedule: RecurringSchedule;
  function: FunctionReference<"mutation" | "action">;
  args: Record<string, unknown>;
  misfirePolicy: MisfirePolicy;
}

export class CronJobs {
  readonly jobs: RecurringJobDefinition[] = [];

  interval(
    name: string,
    schedule: Omit<RecurringIntervalSchedule, "type">,
    functionReference: FunctionReference<"mutation" | "action">,
    args: Record<string, unknown> = {},
    misfirePolicy: MisfirePolicy = { type: "catch_up" }
  ): this {
    this.jobs.push({
      name,
      schedule: { type: "interval", ...schedule },
      function: functionReference,
      args,
      misfirePolicy
    });
    return this;
  }

  daily(
    name: string,
    schedule: Omit<RecurringDailySchedule, "type">,
    functionReference: FunctionReference<"mutation" | "action">,
    args: Record<string, unknown> = {},
    misfirePolicy: MisfirePolicy = { type: "catch_up" }
  ): this {
    this.jobs.push({
      name,
      schedule: { type: "daily", ...schedule },
      function: functionReference,
      args,
      misfirePolicy
    });
    return this;
  }

  weekly(
    name: string,
    schedule: Omit<RecurringWeeklySchedule, "type">,
    functionReference: FunctionReference<"mutation" | "action">,
    args: Record<string, unknown> = {},
    misfirePolicy: MisfirePolicy = { type: "catch_up" }
  ): this {
    this.jobs.push({
      name,
      schedule: { type: "weekly", ...schedule },
      function: functionReference,
      args,
      misfirePolicy
    });
    return this;
  }
}

export function cronJobs(): CronJobs {
  return new CronJobs();
}
