import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
const SyncoreContext = createContext(null);
/**
 * Provide a Syncore client to React descendants.
 *
 * Wrap your app with this component to use Syncore hooks like `useQuery` and
 * `useMutation`.
 */
export function SyncoreProvider({ client, children }) {
    return (_jsx(SyncoreContext.Provider, { value: client, children: children }));
}
/**
 * Read the active Syncore client from React context.
 *
 * Throws if used outside of {@link SyncoreProvider}.
 */
export function useSyncore() {
    const client = useContext(SyncoreContext);
    if (!client) {
        throw new Error("SyncoreProvider is missing from the React tree.");
    }
    return client;
}
/**
 * Load a reactive Syncore query within a React component.
 *
 * The hook subscribes automatically and re-renders whenever the local query
 * result changes.
 */
export function useQuery(reference, ...args) {
    const client = useSyncore();
    const watch = useManagedQueryWatch(client, reference, normalizeOptionalArgs(args));
    const [snapshot, setSnapshot] = useState(() => readWatchSnapshot(watch));
    useEffect(() => {
        const sync = () => {
            setSnapshot(readWatchSnapshot(watch));
        };
        sync();
        return watch.onUpdate(sync);
    }, [watch]);
    if (snapshot.error) {
        throw snapshot.error;
    }
    return snapshot.result;
}
/**
 * Construct a stable function that executes a Syncore mutation.
 */
export function useMutation(reference) {
    const client = useSyncore();
    return (...args) => client.mutation(reference, normalizeOptionalArgs(args));
}
/**
 * Construct a stable function that executes a Syncore action.
 */
export function useAction(reference) {
    const client = useSyncore();
    return (...args) => client.action(reference, normalizeOptionalArgs(args));
}
/**
 * Load several Syncore queries at once using explicit keys.
 */
export function useQueries(entries) {
    const client = useSyncore();
    const entriesKey = stableStringify(entries.map((entry) => ({
        key: entry.key,
        referenceName: entry.reference.name,
        args: entry.args ?? {}
    })));
    const normalizedEntries = useMemo(() => JSON.parse(entriesKey), [entriesKey]);
    const watches = useMemo(() => normalizedEntries.map((entry) => ({
        key: entry.key,
        watch: client.watchQuery({ kind: "query", name: entry.referenceName }, entry.args)
    })), [client, normalizedEntries]);
    const [snapshot, setSnapshot] = useState(() => readQueriesSnapshot(watches));
    useEffect(() => () => {
        for (const entry of watches) {
            entry.watch.dispose?.();
        }
    }, [watches]);
    useEffect(() => {
        const sync = () => {
            setSnapshot(readQueriesSnapshot(watches));
        };
        sync();
        const cleanups = watches.map((entry) => entry.watch.onUpdate(sync));
        return () => {
            for (const cleanup of cleanups) {
                cleanup();
            }
        };
    }, [watches]);
    return snapshot;
}
function useManagedQueryWatch(client, reference, args) {
    const argsKey = stableStringify(args ?? {});
    const normalizedArgs = useMemo(() => JSON.parse(argsKey), [argsKey]);
    const watch = useMemo(() => client.watchQuery(reference, normalizedArgs), [client, normalizedArgs, reference]);
    useEffect(() => () => watch.dispose?.(), [watch]);
    return watch;
}
function normalizeOptionalArgs(args) {
    return (args[0] ?? {});
}
function readWatchSnapshot(watch) {
    return {
        result: watch.localQueryResult(),
        error: watch.localQueryError()
    };
}
function readQueriesSnapshot(watches) {
    return Object.fromEntries(watches.map((entry) => [entry.key, entry.watch.localQueryResult()]));
}
function stableStringify(value) {
    return JSON.stringify(sortValue(value));
}
function sortValue(value) {
    if (Array.isArray(value)) {
        return value.map(sortValue);
    }
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, nested]) => [key, sortValue(nested)]));
    }
    return value;
}
//# sourceMappingURL=index.js.map