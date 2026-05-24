import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Header } from "./Header";
import { useDevtoolsStore } from "@/lib/store";

vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname: "/" } })
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

describe("Header", () => {
  afterEach(() => {
    resetStore();
  });

  it("shows the data source and selected runtime separately for one runtime", () => {
    useDevtoolsStore.getState()._handleMessage({
      type: "hello",
      runtimeId: "runtime-a-12345678",
      platform: "browser-worker",
      targetKind: "client",
      appName: "localhost",
      origin: "http://localhost:3000",
      storageProtocol: "opfs",
      storageIdentity: "opfs://workspace",
      sessionLabel: "Solo Session (Chrome)"
    });

    render(<Header />);

    const targetSelect = screen.getAllByRole("combobox")[0];
    const sessionSelect = screen.getAllByRole("combobox")[1];
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
    expect(targetSelect?.textContent).toContain("localhost:3000 · syncore");
    expect(targetSelect?.textContent).toContain("OPFS");
    expect(targetSelect?.textContent).toMatch(/T\d{5}/);
    expect(targetSelect?.textContent).not.toContain("Solo Session");
    expect(targetSelect?.textContent).not.toContain("Chrome");
    expect(sessionSelect?.textContent).toContain("Solo Session");
    expect(sessionSelect?.textContent).toContain("Chrome");
    expect(sessionSelect?.textContent).toMatch(/[A-Z]\d{3}/);
    expect(sessionSelect?.textContent).not.toContain("All runtimes");
  });

  it("shows all runtimes by default when a second runtime joins the target", () => {
    useDevtoolsStore.getState()._handleMessage({
      type: "hello",
      runtimeId: "runtime-a-12345678",
      platform: "browser-worker",
      targetKind: "client",
      appName: "localhost",
      origin: "http://localhost:3000",
      storageProtocol: "opfs",
      storageIdentity: "opfs://workspace",
      sessionLabel: "Solo Session (Chrome)"
    });
    useDevtoolsStore.getState()._handleMessage({
      type: "hello",
      runtimeId: "runtime-b-87654321",
      platform: "browser-worker",
      targetKind: "client",
      appName: "localhost",
      origin: "http://localhost:3000",
      storageProtocol: "opfs",
      storageIdentity: "opfs://workspace",
      sessionLabel: "Second Session (Edge)"
    });

    render(<Header />);

    const targetSelect = screen.getAllByRole("combobox")[0];
    const sessionSelect = screen.getAllByRole("combobox")[1];
    expect(targetSelect?.textContent).toContain("localhost:3000 · syncore");
    expect(targetSelect?.textContent).not.toContain("Solo Session");
    expect(targetSelect?.textContent).not.toContain("Chrome");
    expect(sessionSelect?.textContent).toContain("All runtimes");
  });

  it("shows the chosen runtime instead of all runtimes after an explicit selection", () => {
    useDevtoolsStore.getState()._handleMessage({
      type: "hello",
      runtimeId: "runtime-a-12345678",
      platform: "browser-worker",
      targetKind: "client",
      appName: "localhost",
      origin: "http://localhost:3000",
      storageProtocol: "opfs",
      storageIdentity: "opfs://workspace",
      sessionLabel: "First Session (Chrome)"
    });
    useDevtoolsStore.getState()._handleMessage({
      type: "hello",
      runtimeId: "runtime-b-87654321",
      platform: "browser-worker",
      targetKind: "client",
      appName: "localhost",
      origin: "http://localhost:3000",
      storageProtocol: "opfs",
      storageIdentity: "opfs://workspace",
      sessionLabel: "Chosen Session (Edge)"
    });
    useDevtoolsStore.getState().selectRuntime("runtime-b-87654321");
    useDevtoolsStore.getState()._handleMessage({
      type: "hello",
      runtimeId: "runtime-c-11223344",
      platform: "browser-worker",
      targetKind: "client",
      appName: "localhost",
      origin: "http://localhost:3000",
      storageProtocol: "opfs",
      storageIdentity: "opfs://workspace",
      sessionLabel: "Third Session (Firefox)"
    });

    render(<Header />);

    const targetSelect = screen.getAllByRole("combobox")[0];
    const sessionSelect = screen.getAllByRole("combobox")[1];
    expect(targetSelect?.textContent).toContain("localhost:3000 · syncore");
    expect(targetSelect?.textContent).not.toContain("First Session");
    expect(targetSelect?.textContent).not.toContain("Chrome");
    expect(sessionSelect?.textContent).toContain("Chosen Session");
    expect(sessionSelect?.textContent).toContain("Edge");
    expect(sessionSelect?.textContent).not.toContain("All runtimes");
  });
});
