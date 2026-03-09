import { describe, expect, it, vi } from "vitest";
import {
  createSyncoreNextWorkerUrl,
  createNextSyncoreClient,
  getSyncoreWorkerUrl,
  resolveSqlJsWasmUrl
} from "./index.js";
import { withSyncoreNext } from "./config.js";

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
      wrapped as unknown as {
        headers: () => Promise<Array<Record<string, unknown>>>;
      }
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

  it("adds only the worker entry for static export builds", async () => {
    const wrapped = withSyncoreNext({ output: "export" });
    const webpack = (
      wrapped as unknown as {
        webpack: (
          config: Record<string, unknown>,
          context: Record<string, unknown>
        ) => Record<string, unknown>;
      }
    ).webpack;

    const configured = webpack(
      {
        experiments: {},
        entry: async () => ({
          "main-app": { import: "./app.js" }
        })
      },
      {
        dir: process.cwd(),
        dev: false,
        isServer: false
      }
    );

    const entries = await (
      configured.entry as () => Promise<Record<string, unknown>>
    )();
    expect(entries).toHaveProperty("main-app");
    expect(entries).not.toHaveProperty("main");
    expect(entries).toHaveProperty("syncore-worker");
  });

  it("returns the worker url", () => {
    expect(getSyncoreWorkerUrl()).toBe(
      "/_next/static/chunks/syncore-worker.js"
    );
  });

  it("creates a default worker module url", () => {
    expect(String(createSyncoreNextWorkerUrl())).toContain("syncore.worker.js");
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
