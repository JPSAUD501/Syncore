import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StoragePage } from "./storage.lazy";
import { TooltipProvider } from "@/components/ui/tooltip";

const subscriptionState = {
  data: {
    kind: "storage.list.result" as const,
    entries: [
      {
        id: "file-1",
        createdAt: 1_700_000_000_000,
        fileName: "note.txt",
        contentType: "text/plain",
        size: 12,
        path: "opfs://files/file-1"
      }
    ],
    totalCount: 1,
    offset: 0,
    hasMore: false
  },
  loading: false,
  error: null as string | null
};

const requestMock = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  createLazyFileRoute:
    () =>
    ({ component }: { component: unknown }) =>
      component
}));

vi.mock("@/hooks/useReactiveData", () => ({
  useDevtoolsSubscription: () => ({
    data: subscriptionState.data,
    loading: subscriptionState.loading,
    error: subscriptionState.error,
    hasData: Boolean(subscriptionState.data)
  })
}));

vi.mock("@/lib/store", () => ({
  request: (...args: unknown[]) => requestMock(...args),
  useActiveRuntime: () => ({
    runtimeId: "runtime-1",
    platform: "browser-worker",
    capabilities: {
      storage: {
        browse: true,
        download: true,
        delete: true
      }
    }
  })
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({
    pushToast: vi.fn()
  })
}));

describe("StoragePage", () => {
  beforeEach(() => {
    requestMock.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 206,
        headers: new Headers({ "content-range": "bytes 0-11/13" }),
        arrayBuffer: async () =>
          new TextEncoder().encode("hello storage").buffer,
        text: async () => "hello storage"
      })
    );
    subscriptionState.loading = false;
    subscriptionState.error = null;
    subscriptionState.data = {
      kind: "storage.list.result",
      entries: [
        {
          id: "file-1",
          createdAt: 1_700_000_000_000,
          fileName: "note.txt",
          contentType: "text/plain",
          size: 12,
          path: "opfs://files/file-1"
        }
      ],
      totalCount: 1,
      offset: 0,
      hasMore: false
    };
  });

  it("renders storage entries from the devtools subscription", () => {
    renderStoragePage();

    expect(screen.getByText("Storage")).toBeTruthy();
    expect(screen.getAllByText("note.txt").length).toBeGreaterThan(0);
    expect(screen.getAllByText("text/plain").length).toBeGreaterThan(0);
    expect(screen.getAllByText("12 B").length).toBeGreaterThan(0);
  });

  it("selects a storage object without requesting preview access", () => {
    renderStoragePage();
    fireEvent.click(screen.getAllByText("note.txt")[0]!);

    expect(
      screen.getAllByText("Preview temporarily disabled").length
    ).toBeGreaterThan(0);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("creates temporary access URLs for downloads", async () => {
    requestMock.mockResolvedValue({
      kind: "storage.access.create.result",
      entry: subscriptionState.data.entries[0],
      url: "http://127.0.0.1:4311/storage/access/ticket",
      expiresAt: Date.now() + 60_000,
      supportsRange: true
    });

    renderStoragePage();
    fireEvent.click(screen.getAllByLabelText("Download storage object")[0]!);

    await waitFor(() => {
      expect(requestMock).toHaveBeenCalledWith({
        kind: "storage.access.create",
        id: "file-1",
        purpose: "download"
      });
    });
  });

  it("shows the empty state when no storage objects exist", () => {
    subscriptionState.data = {
      kind: "storage.list.result",
      entries: [],
      totalCount: 0,
      offset: 0,
      hasMore: false
    };

    renderStoragePage();

    expect(screen.getByText("No storage objects")).toBeTruthy();
  });
});

function renderStoragePage() {
  return render(
    <TooltipProvider>
      <StoragePage />
    </TooltipProvider>
  );
}
