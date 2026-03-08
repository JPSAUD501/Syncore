import { describe, expect, it, vi } from "vitest";
import { createNextSyncoreClient, resolveSqlJsWasmUrl } from "./index.js";
import { createSyncoreNextWorkerUrl, withSyncoreNext } from "./config.js";

describe("@syncore/next", () => {
  it("resolves the default wasm url", () => {
    expect(resolveSqlJsWasmUrl()).toBe("/sql-wasm.wasm");
  });

  it("adds async webassembly and wasm caching headers", async () => {
    const wrapped = withSyncoreNext({});
    const webpack = (
      wrapped as {
        webpack: (config: Record<string, unknown>) => Record<string, unknown>;
      }
    ).webpack;
    const nextConfig = webpack({ experiments: {} });
    expect(nextConfig.experiments).toMatchObject({ asyncWebAssembly: true });

    const headers = await (
      wrapped as { headers: () => Promise<Array<Record<string, unknown>>> }
    ).headers();
    expect(headers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "/sql-wasm.wasm" })
      ])
    );
  });

  it("skips Syncore headers when Next exports a static app", () => {
    const wrapped = withSyncoreNext({ output: "export" });
    expect("headers" in wrapped).toBe(false);
  });

  it("creates a default worker url helper", () => {
    expect(String(createSyncoreNextWorkerUrl())).toContain("syncore.worker.ts");
  });

  it("supports an explicit worker factory", () => {
    const dispose = vi.fn();
    const createWorker = vi.fn(
      () =>
        ({
          terminate: dispose,
          postMessage() {},
          addEventListener() {},
          removeEventListener() {}
        }) as unknown as Worker
    );
    const client = createNextSyncoreClient({ createWorker });
    expect(createWorker).toHaveBeenCalledTimes(1);
    client.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
