import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  SyncoreClient,
  SyncoreRuntimeStatus,
  SyncoreWatch
} from "@syncore/core";
import { useSyncoreStatus } from "../../react/src/index.js";
import type { ExpoSyncoreBootstrap } from "./index.js";
import { SyncoreExpoProvider } from "./react.js";

describe("SyncoreExpoProvider", () => {
  it("surfaces booting and ready states through the deferred client", async () => {
    let resolveClient!: (client: SyncoreClient) => void;
    const clientPromise = new Promise<SyncoreClient>((resolve) => {
      resolveClient = resolve;
    });
    const statusWatch = createTestWatch<SyncoreRuntimeStatus>({
      kind: "ready"
    });
    const bootstrap = {
      getRuntime() {
        throw new Error("not used in test");
      },
      getClient: () => clientPromise,
      stop: vi.fn(async () => undefined),
      reset: vi.fn(async () => undefined)
    } satisfies ExpoSyncoreBootstrap;

    render(
      <SyncoreExpoProvider bootstrap={bootstrap}>
        <StatusProbe />
      </SyncoreExpoProvider>
    );

    expect(screen.getByTestId("expo-status").textContent).toBe("starting");

    await act(async () => {
      resolveClient(createTestClient(statusWatch));
      await clientPromise;
    });

    expect(screen.getByTestId("expo-status").textContent).toBe("ready");
  });
});

function StatusProbe() {
  const status = useSyncoreStatus();
  return <div data-testid="expo-status">{status.kind}</div>;
}

function createTestClient(
  statusWatch: TestWatch<SyncoreRuntimeStatus>
): SyncoreClient {
  return {
    query: vi.fn(),
    mutation: vi.fn(),
    action: vi.fn(),
    watchQuery: vi.fn(
      () => createTestWatch() as unknown as SyncoreWatch<unknown>
    ) as SyncoreClient["watchQuery"],
    watchRuntimeStatus: vi.fn(
      () => statusWatch as unknown as SyncoreWatch<SyncoreRuntimeStatus>
    ) as SyncoreClient["watchRuntimeStatus"]
  };
}

type TestWatch<TResult> = SyncoreWatch<TResult> & {
  setResult(value: TResult): void;
};

function createTestWatch<TResult>(initialValue?: TResult): TestWatch<TResult> {
  const listeners = new Set<() => void>();
  let result = initialValue;

  return {
    onUpdate(callback) {
      listeners.add(callback);
      queueMicrotask(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    localQueryResult() {
      return result;
    },
    localQueryError() {
      return undefined;
    },
    setResult(value) {
      result = value;
      for (const listener of listeners) {
        listener();
      }
    }
  };
}
