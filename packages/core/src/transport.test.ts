import { describe, expect, it, vi } from "vitest";
import {
  SyncoreBridgeClient,
  attachRuntimeBridge,
  type SyncoreBridgeMessageEndpoint
} from "./transport.js";
import type {
  SyncoreRuntime,
  SyncoreRuntimeStatus,
  SyncoreWatch
} from "./runtime/runtime.js";

class TestEndpoint implements SyncoreBridgeMessageEndpoint {
  readonly posted: unknown[] = [];
  private listener: ((event: MessageEvent<unknown>) => void) | undefined;

  postMessage(message: unknown): void {
    this.posted.push(message);
  }

  addEventListener(
    _type: "message",
    listener: (event: MessageEvent<unknown>) => void
  ): void {
    this.listener = listener;
  }

  removeEventListener(
    _type: "message",
    listener: (event: MessageEvent<unknown>) => void
  ): void {
    if (this.listener === listener) {
      this.listener = undefined;
    }
  }

  receive(data: unknown): void {
    this.listener?.({ data } as MessageEvent<unknown>);
  }
}

describe("attachRuntimeBridge", () => {
  it("preserves runtime status capabilities when the ready event arrives", () => {
    const endpoint = new TestEndpoint();
    const client = new SyncoreBridgeClient(endpoint);
    const status: SyncoreRuntimeStatus = {
      kind: "ready",
      capabilities: {
        storage: {
          available: true,
          protocol: "opfs",
          supportsRange: true
        }
      }
    };

    endpoint.receive({
      type: "runtime.status",
      status
    });
    endpoint.receive({
      type: "runtime.ready"
    });

    expect(
      client.watchRuntimeStatus().localQueryResult()?.capabilities?.storage
    ).toEqual({
      available: true,
      protocol: "opfs",
      supportsRange: true
    });
  });

  it("disposes query watches when bridge subscriptions unsubscribe", async () => {
    const endpoint = new TestEndpoint();
    const { watch, unsubscribe, dispose } = createTestWatch();
    const { watch: runtimeStatusWatch } = createTestWatch({
      kind: "ready"
    });
    const runtime = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      createClient: vi.fn(() => ({
        watchQuery: vi.fn(() => watch),
        watchRuntimeStatus: vi.fn(() => runtimeStatusWatch)
      }))
    } as unknown as SyncoreRuntime<any>;

    const bridge = attachRuntimeBridge({
      endpoint,
      createRuntime: () => runtime
    });
    await bridge.ready;

    endpoint.receive({
      type: "watch.subscribe",
      subscriptionId: "sub-1",
      reference: { kind: "query", name: "tasks:list" },
      args: {}
    });
    await Promise.resolve();

    endpoint.receive({
      type: "watch.unsubscribe",
      subscriptionId: "sub-1"
    });
    await Promise.resolve();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes remaining query watches when the bridge is disposed", async () => {
    const endpoint = new TestEndpoint();
    const { watch, unsubscribe, dispose } = createTestWatch();
    const { watch: runtimeStatusWatch } = createTestWatch({
      kind: "ready"
    });
    const runtime = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      createClient: vi.fn(() => ({
        watchQuery: vi.fn(() => watch),
        watchRuntimeStatus: vi.fn(() => runtimeStatusWatch)
      }))
    } as unknown as SyncoreRuntime<any>;

    const bridge = attachRuntimeBridge({
      endpoint,
      createRuntime: () => runtime
    });
    await bridge.ready;

    endpoint.receive({
      type: "watch.subscribe",
      subscriptionId: "sub-1",
      reference: { kind: "query", name: "tasks:list" },
      args: {}
    });
    await Promise.resolve();

    await bridge.dispose();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

function createTestWatch<TValue = unknown>(
  result?: TValue
): {
  watch: SyncoreWatch<TValue>;
  unsubscribe: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
} {
  const unsubscribe = vi.fn();
  const dispose = vi.fn();
  const watch: SyncoreWatch<TValue> = {
    onUpdate: vi.fn((callback: () => void) => {
      callback();
      return unsubscribe;
    }),
    localQueryResult: vi.fn(() => result),
    localQueryError: vi.fn(() => undefined),
    dispose
  };
  return { watch, unsubscribe, dispose };
}
