import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { afterEach, describe, expect, it } from "vitest";
import {
  connectToProjectHub,
  listConnectedClientTargets,
  loadImportDocumentBatches,
  resolveDevtoolsUrl
} from "./project.js";

describe("project hub discovery", () => {
  const servers: Server[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => {
              if (error) {
                reject(error);
                return;
              }
              resolve();
            });
          })
      )
    );
    servers.length = 0;
  });

  it("uses the IPv4 loopback URL for the local devtools hub", () => {
    expect(resolveDevtoolsUrl()).toBe("ws://127.0.0.1:4311");
  });

  it("treats a reset socket on the hub port as no connected targets", async () => {
    const server = createServer((socket) => {
      socket.destroy();
    });
    servers.push(server);
    await listen(server);
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Unable to resolve test port.");
    }

    await expect(
      listConnectedClientTargets(`ws://127.0.0.1:${address.port}`)
    ).resolves.toEqual([]);
  });

  it("returns null when the hub port is occupied but the websocket handshake fails", async () => {
    const server = createServer((socket) => {
      socket.destroy();
    });
    servers.push(server);
    await listen(server);
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Unable to resolve test port.");
    }

    await expect(connectToProjectHub(`ws://127.0.0.1:${address.port}`)).resolves.toBeNull();
  });
});

async function listen(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}


describe("import zip security", () => {
  it("rejects zip entries that escape the extraction directory", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "syncore-cli-test-cwd-"));

    try {
      const zipPath = path.join(cwd, "import.zip");
      const zip = new AdmZip();
      zip.addFile("../../escape.jsonl", Buffer.from('{"id":1}\n'));
      zip.addFile("tasks.jsonl", Buffer.from('{"id":1}\n'));
      zip.writeZip(zipPath);

      await expect(loadImportDocumentBatches(cwd, zipPath)).rejects.toThrow(
        "Invalid ZIP entry path"
      );
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("imports a safe zip archive", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "syncore-cli-test-cwd-"));

    try {
      const zipPath = path.join(cwd, "import.zip");
      const zip = new AdmZip();
      zip.addFile("tasks.jsonl", Buffer.from('{"id":1}\n'));
      zip.addFile("notes/documents.jsonl", Buffer.from('{"id":2}\n'));
      zip.writeZip(zipPath);

      await expect(loadImportDocumentBatches(cwd, zipPath)).resolves.toEqual([
        { table: "notes", rows: [{ id: 2 }] },
        { table: "tasks", rows: [{ id: 1 }] }
      ]);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
