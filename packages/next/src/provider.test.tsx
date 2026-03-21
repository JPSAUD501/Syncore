import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SyncoreNextProvider } from "./index.js";

const platformWebMocks = vi.hoisted(() => ({
  createManagedWebWorkerClient: vi.fn(),
  createSyncoreWebWorkerClient: vi.fn()
}));

vi.mock("@syncore/platform-web", () => {
  return platformWebMocks;
});

describe("SyncoreNextProvider", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not recreate the managed client when createWorker changes identity", async () => {
    const dispose = vi.fn();
    platformWebMocks.createManagedWebWorkerClient.mockReturnValue({
      client: {} as never,
      worker: {} as Worker,
      dispose
    });

    const { rerender, unmount } = render(
      <SyncoreNextProvider
        createWorker={() =>
          ({
            postMessage() {},
            addEventListener() {},
            removeEventListener() {},
            terminate() {}
          }) as unknown as Worker
        }
      >
        <div>ready</div>
      </SyncoreNextProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("ready")).toBeTruthy();
    });
    expect(platformWebMocks.createManagedWebWorkerClient).toHaveBeenCalledTimes(
      1
    );

    rerender(
      <SyncoreNextProvider
        createWorker={() =>
          ({
            postMessage() {},
            addEventListener() {},
            removeEventListener() {},
            terminate() {}
          }) as unknown as Worker
        }
      >
        <div>ready</div>
      </SyncoreNextProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("ready")).toBeTruthy();
    });
    expect(platformWebMocks.createManagedWebWorkerClient).toHaveBeenCalledTimes(
      1
    );

    unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
