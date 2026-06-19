import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  SYNCORE_DEVTOOLS_MAX_SUPPORTED_PROTOCOL_VERSION,
  SYNCORE_DEVTOOLS_MIN_SUPPORTED_PROTOCOL_VERSION,
  SYNCORE_DEVTOOLS_PROTOCOL_VERSION,
  type SyncoreDevtoolsMessage
} from "@syncore/devtools-protocol";
import { Header } from "./Header";
import { useDevtoolsStore } from "@/lib/store";

vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({
    select
  }: {
    select: (state: { location: { pathname: string } }) => string;
  }) => select({ location: { pathname: "/" } })
}));

function resetStore() {
  useDevtoolsStore.setState((state) => ({
    ...state,
    connected: false,
    runtimes: {},
    selectedTargetId: null,
    selectedRuntimeId: null,
    selectedRuntimeFilter: null,
    selectedRuntimeSelectionMode: null,
    includeDashboardActivity: false,
    authRequired: false,
    authError: null
  }));
}

function helloMessage(
  overrides: Partial<Extract<SyncoreDevtoolsMessage, { type: "hello" }>> & {
    runtimeId: string;
    platform: string;
  }
): Extract<SyncoreDevtoolsMessage, { type: "hello" }> {
  return {
    type: "hello",
    protocolVersion: SYNCORE_DEVTOOLS_PROTOCOL_VERSION,
    minSupportedProtocolVersion:
      SYNCORE_DEVTOOLS_MIN_SUPPORTED_PROTOCOL_VERSION,
    maxSupportedProtocolVersion:
      SYNCORE_DEVTOOLS_MAX_SUPPORTED_PROTOCOL_VERSION,
    ...overrides
  };
}

describe("Header", () => {
  afterEach(() => {
    cleanup();
    resetStore();
  });

  it("shows one compact context switcher for one runtime", () => {
    useDevtoolsStore.getState()._handleMessage(helloMessage({
      runtimeId: "runtime-a-12345678",
      platform: "browser-worker",
      targetKind: "client",
      appName: "localhost",
      origin: "http://localhost:3000",
      storageProtocol: "opfs",
      storageIdentity: "opfs://workspace",
      dataSourceAlias: "Quick Sentinel",
      sessionLabel: "Solo Session (Chrome)"
    }));

    render(<Header />);

    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
    const trigger = screen.getByRole("button", {
      name: /Quick Sentinel\s*\/\s*Solo Session/
    });
    expect(trigger.textContent).toContain("Quick Sentinel");
    expect(trigger.textContent).toContain("Solo Session");
    expect(trigger.textContent).not.toContain("OPFS");
    expect(trigger.textContent).not.toMatch(/T\d{5}/);
    expect(trigger.textContent).not.toContain("Chrome");
  });

  it("shows all runtimes by default in the compact context when a second runtime joins", () => {
    useDevtoolsStore.getState()._handleMessage(helloMessage({
      runtimeId: "runtime-a-12345678",
      platform: "browser-worker",
      targetKind: "client",
      appName: "localhost",
      origin: "http://localhost:3000",
      storageProtocol: "opfs",
      storageIdentity: "opfs://workspace",
      dataSourceAlias: "Quick Sentinel",
      sessionLabel: "Solo Session (Chrome)"
    }));
    useDevtoolsStore.getState()._handleMessage(helloMessage({
      runtimeId: "runtime-b-87654321",
      platform: "browser-worker",
      targetKind: "client",
      appName: "localhost",
      origin: "http://localhost:3000",
      storageProtocol: "opfs",
      storageIdentity: "opfs://workspace",
      dataSourceAlias: "Quick Sentinel",
      sessionLabel: "Second Session (Edge)"
    }));

    render(<Header />);

    const trigger = screen.getByRole("button", {
      name: /Quick Sentinel\s*\/\s*All runtimes/
    });
    expect(trigger.textContent).toContain("Quick Sentinel");
    expect(trigger.textContent).toContain("All runtimes");
    expect(trigger.textContent).not.toContain("Solo Session");
    expect(trigger.textContent).not.toContain("Chrome");
  });

  it("shows the chosen runtime after an explicit selection", () => {
    useDevtoolsStore.getState()._handleMessage(helloMessage({
      runtimeId: "runtime-a-12345678",
      platform: "browser-worker",
      targetKind: "client",
      appName: "localhost",
      origin: "http://localhost:3000",
      storageProtocol: "opfs",
      storageIdentity: "opfs://workspace",
      dataSourceAlias: "Quick Sentinel",
      sessionLabel: "First Session (Chrome)"
    }));
    useDevtoolsStore.getState()._handleMessage(helloMessage({
      runtimeId: "runtime-b-87654321",
      platform: "browser-worker",
      targetKind: "client",
      appName: "localhost",
      origin: "http://localhost:3000",
      storageProtocol: "opfs",
      storageIdentity: "opfs://workspace",
      dataSourceAlias: "Quick Sentinel",
      sessionLabel: "Chosen Session (Edge)"
    }));
    useDevtoolsStore.getState().selectRuntime("runtime-b-87654321");
    useDevtoolsStore.getState()._handleMessage(helloMessage({
      runtimeId: "runtime-c-11223344",
      platform: "browser-worker",
      targetKind: "client",
      appName: "localhost",
      origin: "http://localhost:3000",
      storageProtocol: "opfs",
      storageIdentity: "opfs://workspace",
      dataSourceAlias: "Quick Sentinel",
      sessionLabel: "Third Session (Firefox)"
    }));

    render(<Header />);

    const trigger = screen.getByRole("button", {
      name: /Quick Sentinel\s*\/\s*Chosen Session/
    });
    expect(trigger.textContent).toContain("Quick Sentinel");
    expect(trigger.textContent).toContain("Chosen Session");
    expect(trigger.textContent).not.toContain("Edge");
    expect(trigger.textContent).not.toContain("All runtimes");
  });
});
