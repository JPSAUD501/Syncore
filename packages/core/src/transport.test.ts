import { describe, expect, it, vi } from "vitest";
import { attachRuntimeBridge, type SyncoreBridgeMessageEndpoint } from "./transport.js";
import type { SyncoreRuntime, SyncoreWatch } from "./runtime/runtime.js";

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
  it("disposes query watches when bridge subscriptions unsubscribe", async () => {
    const endpoint = new TestEndpoint();
    const { watch, unsubscribe, dispose } = createTestWatch();
    const runtime = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      createClient: vi.fn(() => ({
        watchQuery: vi.fn(() => watch)
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
    const runtime = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      createClient: vi.fn(() => ({
        watchQuery: vi.fn(() => watch)
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

function createTestWatch(): {
  watch: SyncoreWatch<unknown>;
  unsubscribe: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
} {
  const unsubscribe = vi.fn();
  const dispose = vi.fn();
  const watch: SyncoreWatch<unknown> = {
    onUpdate: vi.fn((callback: () => void) => {
      callback();
      return unsubscribe;
    }),
    localQueryResult: vi.fn(() => undefined),
    localQueryError: vi.fn(() => undefined),
    dispose
  };
  return { watch, unsubscribe, dispose };
}
