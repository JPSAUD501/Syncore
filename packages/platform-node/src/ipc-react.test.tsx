// @vitest-environment jsdom

import { act, render, waitFor } from "@testing-library/react";
import { Fragment, StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFunctionReference } from "@syncore/core";
import { useQuery } from "@syncore/react";
import { SyncoreElectronProvider } from "./ipc-react.js";

const listTasks = createFunctionReference<
  "query",
  Record<never, never>,
  string[]
>("query", "tasks/list");

function QueryProbe(): null {
  useQuery(listTasks);
  return null;
}

function createBridgeWindow(bridgeName: string) {
  const unsubscribe = vi.fn();
  const postMessage = vi.fn();
  const windowObject = Object.create(window) as Window &
    typeof globalThis &
    Record<string, unknown>;
  windowObject[bridgeName] = {
    postMessage,
    onMessage: vi.fn(() => unsubscribe)
  };
  return { postMessage, unsubscribe, windowObject };
}

afterEach(async () => {
  await act(async () => {
    await Promise.resolve();
  });
});

describe("SyncoreElectronProvider", () => {
  it("keeps the renderer client alive through Strict Mode effect replay", async () => {
    const bridgeName = "strictModeBridge";
    const bridge = createBridgeWindow(bridgeName);
    const view = render(
      <StrictMode>
        <SyncoreElectronProvider
          bridgeName={bridgeName}
          windowObject={bridge.windowObject}
        >
          <QueryProbe />
        </SyncoreElectronProvider>
      </StrictMode>
    );

    await waitFor(() => {
      expect(bridge.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "watch.subscribe" })
      );
    });
    expect(bridge.unsubscribe).not.toHaveBeenCalled();

    view.unmount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(bridge.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("shares one client across providers and disposes it after the last unmount", async () => {
    const bridgeName = "sharedBridge";
    const bridge = createBridgeWindow(bridgeName);
    const provider = (key: string) => (
      <SyncoreElectronProvider
        bridgeName={bridgeName}
        key={key}
        windowObject={bridge.windowObject}
      >
        <QueryProbe />
      </SyncoreElectronProvider>
    );
    const view = render(
      <Fragment>
        {provider("first")}
        {provider("second")}
      </Fragment>
    );

    await waitFor(() => {
      expect(bridge.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "watch.subscribe" })
      );
    });

    view.rerender(provider("second"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(bridge.unsubscribe).not.toHaveBeenCalled();

    view.unmount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(bridge.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("disposes the client when the renderer window unloads", async () => {
    const bridgeName = "unloadBridge";
    const bridge = createBridgeWindow(bridgeName);
    const view = render(
      <SyncoreElectronProvider
        bridgeName={bridgeName}
        windowObject={bridge.windowObject}
      >
        <QueryProbe />
      </SyncoreElectronProvider>
    );

    await waitFor(() => expect(bridge.postMessage).toHaveBeenCalled());
    bridge.windowObject.dispatchEvent(new Event("beforeunload"));
    expect(bridge.unsubscribe).toHaveBeenCalledTimes(1);

    view.unmount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(bridge.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
