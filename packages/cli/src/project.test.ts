import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { afterEach, describe, expect, it } from "vitest";
import {
  connectToProjectHub,
  listConnectedClientTargets,
  loadImportDocumentBatches,
  resolveActiveDashboardUrl,
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

  it("prefers the authenticated dashboard URL from the local session file", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "syncore-cli-dashboard-"));

    try {
      await mkdir(path.join(cwd, ".syncore"), { recursive: true });
      await writeFile(
        path.join(cwd, ".syncore", "devtools-session.json"),
        JSON.stringify({
          dashboardUrl: "http://localhost:4310",
          authenticatedDashboardUrl: "http://localhost:4310/?token=testtoken",
          devtoolsUrl: "ws://127.0.0.1:4311",
          token: "testtoken"
        })
      );

      await expect(resolveActiveDashboardUrl(cwd)).resolves.toBe(
        "http://localhost:4310/?token=testtoken"
      );
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
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
      zip.addFile("safe/folder1.jsonl", Buffer.from('{"id":1}\n'));
      zip.addFile("tasks.jsonl", Buffer.from('{"id":1}\n'));
      zip.writeZip(zipPath);
      await rewriteZipEntryName(
        zipPath,
        "safe/folder1.jsonl",
        "../../escape.jsonl"
      );

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

async function rewriteZipEntryName(
  zipPath: string,
  safeEntryName: string,
  unsafeEntryName: string
): Promise<void> {
  if (safeEntryName.length !== unsafeEntryName.length) {
    throw new Error("ZIP test entry names must have the same length.");
  }

  const source = await readFile(zipPath);
  const safeBuffer = Buffer.from(safeEntryName, "latin1");
  const unsafeBuffer = Buffer.from(unsafeEntryName, "latin1");
  let replacements = 0;

  for (let index = source.indexOf(safeBuffer); index >= 0; index = source.indexOf(safeBuffer, index + safeBuffer.length)) {
    unsafeBuffer.copy(source, index);
    replacements += 1;
  }

  if (replacements < 2) {
    throw new Error("Expected to rewrite ZIP entry names in both ZIP headers.");
  }

  await writeFile(zipPath, source);
}
