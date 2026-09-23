import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineSchema, defineTable, s } from "../../core/src/index.ts";

const openedUrls = vi.hoisted(() => [] as string[]);

vi.mock("ws", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ws")>();
  class RecordingWebSocket extends actual.default {
    constructor(...args: ConstructorParameters<typeof actual.default>) {
      openedUrls.push(String(args[0]));
      super(...args);
    }
  }
  return { ...actual, default: RecordingWebSocket };
});

const { createNodeSyncoreRuntime } = await import("./index.js");

const schema = defineSchema({
  notes: defineTable({ body: s.string() })
});

describe("Node devtools defaults under a test runner", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    openedUrls.length = 0;
  });

  it("does not connect to the default devtools URL", async () => {
    vi.stubEnv("SYNCORE_DEVTOOLS_URL", undefined);
    vi.stubEnv("SYNCORE_DISABLE_DEVTOOLS", undefined);
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "syncore-node-"));
    const runtime = createNodeSyncoreRuntime({
      databasePath: path.join(rootDir, "app.db"),
      storageDirectory: path.join(rootDir, "storage"),
      schema,
      functions: {}
    });

    await runtime.start();
    await runtime.stop();

    expect(openedUrls).toEqual([]);
  });

  it("still connects when a URL is set in the environment", async () => {
    vi.stubEnv("SYNCORE_DEVTOOLS_URL", "ws://127.0.0.1:1");
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "syncore-node-"));
    const runtime = createNodeSyncoreRuntime({
      databasePath: path.join(rootDir, "app.db"),
      storageDirectory: path.join(rootDir, "storage"),
      schema,
      functions: {}
    });

    await runtime.start();
    await runtime.stop();

    expect(openedUrls).toEqual(["ws://127.0.0.1:1"]);
  });
});
