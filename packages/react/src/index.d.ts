import { type ReactNode } from "react";
import type { FunctionReference, SyncoreClient } from "@syncore/core";
type OptionalArgsTuple<TArgs> = Record<never, never> extends TArgs ? [args?: TArgs] : [args: TArgs];
/**
 * Provide a Syncore client to React descendants.
 *
 * Wrap your app with this component to use Syncore hooks like `useQuery` and
 * `useMutation`.
 */
export declare function SyncoreProvider({ client, children }: {
    client: SyncoreClient;
    children: ReactNode;
}): import("react/jsx-runtime").JSX.Element;
/**
 * Read the active Syncore client from React context.
 *
 * Throws if used outside of {@link SyncoreProvider}.
 */
export declare function useSyncore(): SyncoreClient;
/**
 * Load a reactive Syncore query within a React component.
 *
 * The hook subscribes automatically and re-renders whenever the local query
 * result changes.
 */
export declare function useQuery<TArgs, TResult>(reference: FunctionReference<"query", TArgs, TResult>, ...args: OptionalArgsTuple<TArgs>): TResult | undefined;
/**
 * Construct a stable function that executes a Syncore mutation.
 */
export declare function useMutation<TArgs, TResult>(reference: FunctionReference<"mutation", TArgs, TResult>): (...args: OptionalArgsTuple<TArgs>) => Promise<TResult>;
/**
 * Construct a stable function that executes a Syncore action.
 */
export declare function useAction<TArgs, TResult>(reference: FunctionReference<"action", TArgs, TResult>): (...args: OptionalArgsTuple<TArgs>) => Promise<TResult>;
/**
 * Load several Syncore queries at once using explicit keys.
 */
export declare function useQueries<TResult>(entries: Array<{
    key: string;
    reference: FunctionReference<"query">;
    args?: Record<string, unknown>;
}>): Record<string, TResult | undefined>;
export {};
//# sourceMappingURL=index.d.ts.map