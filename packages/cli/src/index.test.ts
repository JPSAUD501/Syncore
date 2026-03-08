import { mkdtemp, mkdir, readFile, rm, stat, symlink } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import WebSocket from "ws";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

const cliRoot = import.meta.dirname;
const distCliPath = path.resolve(cliRoot, "..", "dist", "index.mjs");
const workspaceRoot = path.resolve(cliRoot, "..", "..", "..");

const tempDirectories: string[] = [];

beforeAll(async () => {
  await stat(distCliPath);
});

afterEach(async () => {
  while (tempDirectories.length > 0) {
    const directory = tempDirectories.pop();
    if (!directory) {
      continue;
    }
    await rm(directory, { recursive: true, force: true });
  }
});

describe("syncore CLI", () => {
  test("init scaffolds a project and codegen is stable", async () => {
    const cwd = await createTempProjectDirectory();

    await runCli(cwd, ["init"]);

    const generatedApiPath = path.join(cwd, "syncore", "_generated", "api.ts");
    const generatedFunctionsPath = path.join(cwd, "syncore", "_generated", "functions.ts");
    const generatedServerPath = path.join(cwd, "syncore", "_generated", "server.ts");
    const messagesFunctionPath = path.join(cwd, "syncore", "functions", "messages.ts");
    const firstGeneratedApi = await readFile(generatedApiPath, "utf8");
    const firstGeneratedFunctions = await readFile(generatedFunctionsPath, "utf8");
    const firstGeneratedServer = await readFile(generatedServerPath, "utf8");
    const messagesFunction = await readFile(messagesFunctionPath, "utf8");

    expect(await exists(path.join(cwd, "syncore.config.ts"))).toBe(true);
    expect(await exists(path.join(cwd, "syncore", "schema.ts"))).toBe(true);
    expect(await exists(path.join(cwd, "syncore", "functions", "messages.ts"))).toBe(true);
    expect(firstGeneratedApi).toContain('"messages"');
    expect(firstGeneratedApi).toContain("createFunctionReference");
    expect(firstGeneratedApi).toContain(
      'createFunctionReferenceFor<typeof messages__createMessage>("mutation", "messages/createMessage")'
    );
    expect(firstGeneratedFunctions).toContain('"messages/createMessage"');
    expect(firstGeneratedServer).toContain(
      'export { createFunctionReference, createFunctionReferenceFor, v } from "syncore";'
    );
    expect(firstGeneratedServer).toContain('import type schema from "../schema"');
    expect(firstGeneratedServer).toContain(
      'import { action as baseAction, mutation as baseMutation, query as baseQuery } from "syncore";'
    );
    expect(firstGeneratedServer).toContain("export function query<");
    expect(firstGeneratedServer).toContain(
      'export function query<TValidator extends Validator<unknown>, TResult>('
    );
    expect(firstGeneratedServer).toContain(
      'export function mutation<TValidator extends Validator<unknown>, TResult>('
    );
    expect(firstGeneratedServer).toContain(
      'export function action<TValidator extends Validator<unknown>, TResult>('
    );
    expect(firstGeneratedServer).toContain('return baseQuery(config as never) as SyncoreFunctionDefinition<');
    expect(firstGeneratedServer).not.toContain('type FunctionReference,');
    expect(firstGeneratedServer).not.toContain('  v,');
    expect(messagesFunction).toContain('../_generated/server');

    await runCli(cwd, ["codegen"]);
    const secondGeneratedApi = await readFile(generatedApiPath, "utf8");
    const secondGeneratedFunctions = await readFile(generatedFunctionsPath, "utf8");
    const secondGeneratedServer = await readFile(generatedServerPath, "utf8");

    expect(secondGeneratedApi).toBe(firstGeneratedApi);
    expect(secondGeneratedFunctions).toBe(firstGeneratedFunctions);
    expect(secondGeneratedServer).toBe(firstGeneratedServer);
  });

  test("migration commands generate SQL, apply it, and report clean state", async () => {
    const cwd = await createTempProjectDirectory();

    await runCli(cwd, ["init"]);
    await linkWorkspacePackage(cwd, "syncore");

    const generateResult = await runCli(cwd, ["migrate:generate", "initial"]);
    expect(generateResult.stdout).toContain("Generated");

    const migrationPath = path.join(cwd, "syncore", "migrations", "0001_initial.sql");
    expect(await exists(migrationPath)).toBe(true);
    expect(await exists(path.join(cwd, "syncore", "migrations", "_schema_snapshot.json"))).toBe(
      true
    );

    const applyResult = await runCli(cwd, ["migrate:apply"]);
    expect(applyResult.stdout).toContain("Applied 1 migration(s).");

    const databasePath = path.join(cwd, ".syncore", "syncore.db");
    const database = new DatabaseSync(databasePath);
    const appliedMigration = database
      .prepare(`SELECT COUNT(*) AS count FROM "_syncore_migrations"`)
      .get() as { count: number };
    database.close();
    expect(appliedMigration.count).toBe(1);

    const statusResult = await runCli(cwd, ["migrate:status"]);
    expect(statusResult.stdout).toContain("Statements to generate: 0");
    expect(statusResult.stdout).toContain("Destructive changes: 0");
  });

  test("dev starts the hub and serves websocket clients", async () => {
    const cwd = await createTempProjectDirectory();
    const devtoolsPort = await getAvailablePort();
    const dashboardPort = await getAvailablePort();
    await runCli(cwd, ["init"]);
    await linkWorkspacePackage(cwd, "syncore");

    const child = spawn(process.execPath, [distCliPath, "dev"], {
      cwd,
      env: {
        ...process.env,
        SYNCORE_DEVTOOLS_PORT: String(devtoolsPort),
        SYNCORE_DASHBOARD_PORT: String(dashboardPort)
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    const childPipes = getPipedStreams(child);

    const output = await waitForOutput(
      child,
      childPipes,
      `Syncore devtools hub listening on ws://127.0.0.1:${devtoolsPort}`
    );

    expect(output).toContain(`Syncore devtools hub listening on ws://127.0.0.1:${devtoolsPort}`);
    expect(output).toContain("Syncore dev bootstrap complete.");

    const helloMessage = await readWebSocketMessage(
      `ws://127.0.0.1:${devtoolsPort}`
    );
    expect(helloMessage).toContain('"type":"hello"');

    child.kill("SIGTERM");
    await waitForExit(child);
  });
});

async function createTempProjectDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "syncore-cli-"));
  tempDirectories.push(directory);
  return directory;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function runCli(
  cwd: string,
  args: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [distCliPath, ...args], {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      const exitCode = code ?? 1;
      if (exitCode !== 0) {
        reject(
          new Error(
            `syncore ${args.join(" ")} failed with code ${exitCode}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`
          )
        );
        return;
      }
      resolve({ stdout, stderr, exitCode });
    });
  });
}

async function waitForOutput(
  child: ReturnType<typeof spawn>,
  pipes: { stdout: NodeJS.ReadableStream; stderr: NodeJS.ReadableStream },
  needle: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for "${needle}" from syncore dev.`));
    }, 15_000);

    const handleData = (chunk: Buffer | string) => {
      output += chunk.toString();
      if (output.includes(needle)) {
        cleanup();
        resolve(output);
      }
    };

    const handleExit = (code: number | null) => {
      cleanup();
      reject(new Error(`syncore dev exited before becoming ready (code ${code ?? "unknown"}).`));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      pipes.stdout.off("data", handleData);
      pipes.stderr.off("data", handleData);
      child.off("exit", handleExit);
    };

    pipes.stdout.on("data", handleData);
    pipes.stderr.on("data", handleData);
    child.on("exit", handleExit);
  });
}

async function readWebSocketMessage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);

    socket.once("message", (payload) => {
      socket.close();
      resolve(stringifyWebSocketPayload(payload));
    });
    socket.once("error", (error) => {
      reject(error);
    });
  });
}

async function waitForExit(child: ReturnType<typeof spawn>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    child.once("exit", () => resolve());
    child.once("error", reject);
  });
}

async function getAvailablePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Unable to resolve an ephemeral port for CLI tests."));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function linkWorkspacePackage(cwd: string, packageName: string): Promise<void> {
  const nodeModulesDirectory = path.join(cwd, "node_modules");
  await mkdir(nodeModulesDirectory, { recursive: true });

  const source = resolveWorkspacePackageDirectory(packageName);
  const destination = path.join(nodeModulesDirectory, packageName);
  await symlink(source, destination, process.platform === "win32" ? "junction" : "dir");
}

function resolveWorkspacePackageDirectory(packageName: string): string {
  if (packageName === "syncore") {
    return path.join(workspaceRoot, "packages", "core");
  }
  throw new Error(`No workspace package directory mapping exists for "${packageName}".`);
}

function getPipedStreams(child: ReturnType<typeof spawn>): {
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
} {
  if (!child.stdout || !child.stderr) {
    throw new Error("Expected spawned CLI process to have piped stdout/stderr.");
  }
  return {
    stdout: child.stdout,
    stderr: child.stderr
  };
}

function stringifyWebSocketPayload(payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }
  if (payload instanceof Buffer) {
    return payload.toString("utf8");
  }
  if (Array.isArray(payload)) {
    return Buffer.concat(payload).toString("utf8");
  }
  if (payload instanceof ArrayBuffer) {
    return Buffer.from(payload).toString("utf8");
  }
  if (ArrayBuffer.isView(payload)) {
    return Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength).toString(
      "utf8"
    );
  }
  throw new Error("Received an unsupported WebSocket payload type.");
}
