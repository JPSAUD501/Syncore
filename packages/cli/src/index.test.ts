import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeAll, describe, expect, test } from "vitest";
import {
  type ClientTargetDescriptor,
  createBasePublicClientTargetId,
  createPublicClientTargetId,
  createPublicRuntimeId
} from "./project.js";
import { printTargetsTable } from "./render.js";
import { resolveClientRuntime } from "./targets.js";

const cliRoot = import.meta.dirname;
const workspaceRoot = path.resolve(cliRoot, "..", "..", "..");
const cliEntryPath = path.resolve(workspaceRoot, "packages", "cli", "src", "index.ts");
const cliPackagePath = path.resolve(cliRoot, "..", "package.json");
const tsxRegisterPath = pathToFileURL(
  path.resolve(workspaceRoot, "node_modules", "tsx", "dist", "loader.mjs")
).href;
const tsxTsconfigPath = path.resolve(workspaceRoot, "tsconfig.base.json");

const tempDirectories: string[] = [];

beforeAll(async () => {
  await stat(cliEntryPath);
});

afterEach(async () => {
  while (tempDirectories.length > 0) {
    const directory = tempDirectories.pop();
    if (!directory) {
      continue;
    }
    await removeDirectoryWithRetry(directory);
  }
});

describe("syncore CLI", () => {
  test("root version is exposed", async () => {
    const result = await runCli(workspaceRoot, ["--version"]);
    const packageJson = JSON.parse(await readFile(cliPackagePath, "utf8")) as {
      version: string;
    };

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(packageJson.version);
  });

  test("init scaffolds a project and codegen remains stable", async () => {
    const cwd = await createTempProjectDirectory();
    await writeWorkspaceTsconfig(cwd);

    const initResult = await runCli(cwd, ["init", "--template", "node", "--yes"]);
    expect(initResult.exitCode).toBe(0);

    const generatedApiPath = path.join(cwd, "syncore", "_generated", "api.ts");
    const generatedComponentsPath = path.join(
      cwd,
      "syncore",
      "_generated",
      "components.ts"
    );
    const generatedFunctionsPath = path.join(cwd, "syncore", "_generated", "functions.ts");
    const generatedSchemaPath = path.join(
      cwd,
      "syncore",
      "_generated",
      "schema.ts"
    );
    const generatedServerPath = path.join(cwd, "syncore", "_generated", "server.ts");
    const configPath = path.join(cwd, "syncore.config.ts");
    const firstGeneratedApi = await readFile(generatedApiPath, "utf8");
    const firstGeneratedFunctions = await readFile(generatedFunctionsPath, "utf8");
    const firstGeneratedServer = await readFile(generatedServerPath, "utf8");
    const configSource = await readFile(configPath, "utf8");

    expect(firstGeneratedApi).toContain("readonly tasks: SyncoreApi__tasks;");
    expect(await exists(generatedComponentsPath)).toBe(true);
    expect(firstGeneratedFunctions).toContain('"tasks/create"');
    expect(await exists(generatedSchemaPath)).toBe(true);
    expect(firstGeneratedServer).toContain("export function query<");
    expect(configSource).toContain("projectTarget");
    expect(configSource).toContain('databasePath: ".syncore/syncore.db"');

    const codegenResult = await runCli(cwd, ["codegen"]);
    expect(codegenResult.exitCode).toBe(0);
    expect(await readFile(generatedApiPath, "utf8")).toBe(firstGeneratedApi);
    expect(await readFile(generatedFunctionsPath, "utf8")).toBe(
      firstGeneratedFunctions
    );
    expect(await readFile(generatedServerPath, "utf8")).toBe(
      firstGeneratedServer
    );
  });

  test("init refuses a non-empty directory when the interactive prompt is declined", async () => {
    const cwd = await createTempProjectDirectory();
    await writeWorkspaceTsconfig(cwd);
    await writeFile(path.join(cwd, "placeholder.txt"), "keep me\n");

    const result = await runCli(
      cwd,
      ["init", "--template", "node"],
      {
        stdin: "n\n",
        env: {
          SYNCORE_FORCE_INTERACTIVE: "1"
        }
      }
    );

    expect(result.exitCode).toBe(1);
    expect(await exists(path.join(cwd, "syncore.config.ts"))).toBe(false);
  });

  test("react-web init does not scaffold a projectTarget", async () => {
    const cwd = await createTempProjectDirectory();
    await writeWorkspaceTsconfig(cwd);

    const result = await runCli(cwd, ["init", "--template", "react-web", "--yes"]);
    expect(result.exitCode).toBe(0);

    const configSource = await readFile(path.join(cwd, "syncore.config.ts"), "utf8");
    expect(configSource).not.toContain("projectTarget");
    expect(configSource.trim()).toBe("export default {};");
  });

  test("codegen emits .js relative imports for NodeNext projects", async () => {
    const cwd = await createTempProjectDirectory();
    await writeWorkspaceTsconfig(cwd);
    await writeFile(
      path.join(cwd, "tsconfig.main.json"),
      `${JSON.stringify(
        {
          extends: "./tsconfig.json",
          compilerOptions: {
            module: "NodeNext",
            moduleResolution: "NodeNext"
          }
        },
        null,
        2
      )}\n`
    );

    const result = await runCli(cwd, ["init", "--template", "node", "--yes"]);
    expect(result.exitCode).toBe(0);

    const generatedApi = await readFile(
      path.join(cwd, "syncore", "_generated", "api.ts"),
      "utf8"
    );
    const generatedFunctions = await readFile(
      path.join(cwd, "syncore", "_generated", "functions.ts"),
      "utf8"
    );
    const generatedServer = await readFile(
      path.join(cwd, "syncore", "_generated", "server.ts"),
      "utf8"
    );

    expect(generatedApi).toContain('../functions/tasks.js');
    expect(generatedFunctions).toContain('../functions/tasks.js');
    expect(generatedServer).toContain('../schema.js');
  });

  test("doctor reports workspace-root context in the monorepo root", async () => {
    const result = await runCli(workspaceRoot, ["doctor", "--json"]);

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout) as {
      data: {
        status: string;
        workspaceMatches: Array<{ relativePath: string }>;
      };
    };
    expect(payload.data.status).toBe("workspace-root");
    expect(payload.data.workspaceMatches.length).toBeGreaterThan(0);
  });

  test("doctor reports waiting-for-client for client-only templates without a connected runtime", async () => {
    const cwd = await createTempProjectDirectory();
    await writeWorkspaceTsconfig(cwd);
    await runCli(cwd, ["init", "--template", "react-web", "--yes"]);

    const result = await runCli(cwd, ["doctor", "--json"], {
      env: {
        SYNCORE_DEVTOOLS_PORT: "45991"
      }
    });
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout) as {
      data: {
        status: string;
        suggestions: string[];
      };
    };
    expect(payload.data.status).toBe("waiting-for-client");
    expect(payload.data.suggestions.some((entry) => entry.includes("targets"))).toBe(true);
  });

  test("doctor JSON exposes primaryIssue and diagnostics for incomplete projects", async () => {
    const cwd = await createTempProjectDirectory();
    await writeWorkspaceTsconfig(cwd);
    await mkdir(path.join(cwd, "syncore", "functions"), { recursive: true });
    await writeFile(path.join(cwd, "syncore.config.ts"), "export default {};\n");

    const result = await runCli(cwd, ["doctor", "--json"]);
    expect(result.exitCode).toBe(0);

    const payload = JSON.parse(result.stdout) as {
      data: {
        status: string;
        checks: Array<{ category: string; path: string; ok: boolean }>;
        primaryIssue: { code: string; summary: string };
        diagnostics: Array<{ id: string; category: string; status: string }>;
      };
    };
    expect(payload.data.status).toBe("missing-project");
    expect(payload.data.primaryIssue.code).toBe("missing-project");
    expect(payload.data.diagnostics.some((entry) => entry.id === "project.structure")).toBe(
      true
    );
    expect(
      payload.data.checks.some(
        (entry) => entry.category === "schema" && entry.path === "syncore/schema.ts" && !entry.ok
      )
    ).toBe(true);
  });

  test("doctor reports schema-drift with enriched drift metadata", async () => {
    const cwd = await createTempProjectDirectory();
    await writeWorkspaceTsconfig(cwd);
    await runCli(cwd, ["init", "--template", "node", "--yes"]);

    const schemaPath = path.join(cwd, "syncore", "schema.ts");
    const originalSchema = await readFile(schemaPath, "utf8");
    await writeFile(
      schemaPath,
      originalSchema.replace("text: v.string()", "text: v.string(),\n    done: v.optional(v.boolean())")
    );

    const result = await runCli(cwd, ["doctor", "--json"]);
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout) as {
      data: {
        status: string;
        drift: {
          state: string;
          currentSchemaHash: string | null;
          storedSchemaHash: string | null;
        };
        primaryIssue: { code: string };
      };
    };
    expect(payload.data.status).toBe("schema-drift");
    expect(payload.data.primaryIssue.code).toBe("schema-drift");
    expect(payload.data.drift.state).not.toBe("clean");
    expect(payload.data.drift.currentSchemaHash).not.toBe(payload.data.drift.storedSchemaHash);
  });

  test("doctor --fix regenerates generated files without touching the database", async () => {
    const cwd = await createTempProjectDirectory();
    await writeWorkspaceTsconfig(cwd);
    await runCli(cwd, ["init", "--template", "node", "--yes"]);

    const generatedApiPath = path.join(cwd, "syncore", "_generated", "api.ts");
    const databasePath = path.join(cwd, ".syncore", "syncore.db");
    await rm(generatedApiPath, { force: true });

    const result = await runCli(cwd, ["doctor", "--fix", "--json"]);
    expect(result.exitCode).toBe(0);
    expect(await exists(generatedApiPath)).toBe(true);
    expect(await exists(databasePath)).toBe(false);

    const payload = JSON.parse(result.stdout) as {
      summary?: string;
      data: { appliedFixes?: string[]; autoFixesAvailable: boolean };
    };
    expect(payload.summary).toContain("Applied");
    expect(payload.data.appliedFixes?.some((entry) => entry.includes("Regenerated"))).toBe(
      true
    );
  });

  test("dev --once fails non-interactively when the project is missing", async () => {
    const cwd = await createTempProjectDirectory();
    await writeWorkspaceTsconfig(cwd);

    const result = await runCli(cwd, ["dev", "--once", "--template", "node"]);
    expect(result.exitCode).toBe(1);
    expect(await exists(path.join(cwd, "syncore.config.ts"))).toBe(false);
    expect(await exists(path.join(cwd, ".syncore", "syncore.db"))).toBe(false);
  });

  test("dev --once scaffolds interactively and bootstraps the project", async () => {
    const cwd = await createTempProjectDirectory();
    await writeWorkspaceTsconfig(cwd);

    const result = await runCli(
      cwd,
      ["dev", "--once", "--template", "node"],
      {
        stdin: "y\n",
        env: {
          SYNCORE_FORCE_INTERACTIVE: "1"
        }
      }
    );

    expect(result.exitCode).toBe(0);
    expect(await exists(path.join(cwd, "syncore.config.ts"))).toBe(true);
    expect(await exists(path.join(cwd, ".syncore", "syncore.db"))).toBe(true);
  }, 20_000);

  test("dev --once human output does not repeat the syncore label", async () => {
    const cwd = await createTempProjectDirectory();
    await writeWorkspaceTsconfig(cwd);

    const result = await runCli(
      cwd,
      ["dev", "--once", "--template", "node"],
      {
        stdin: "y\n",
        env: {
          SYNCORE_FORCE_INTERACTIVE: "1"
        }
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("[info] Starting Syncore local dev session...");
    expect(result.stdout).not.toContain("[syncore] [info]");
    expect(result.stderr).not.toContain("[syncore] [error]");
  }, 20_000);

  test("dev --once --typecheck try skips cleanly when TypeScript is unavailable", async () => {
    const cwd = await createTempProjectDirectory();
    await writeWorkspaceTsconfig(cwd);

    const result = await runCli(
      cwd,
      ["dev", "--once", "--template", "node", "--typecheck", "try"],
      {
        stdin: "y\n",
        env: {
          SYNCORE_FORCE_INTERACTIVE: "1"
        }
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("Typecheck skipped");
    expect(result.stdout).toContain("typecheck: skipped");
  }, 20_000);

  test("dev --once --typecheck enable fails when the compiler reports errors", async () => {
    const cwd = await createTempProjectDirectory();
    await writeWorkspaceTsconfig(cwd);
    await mkdir(path.join(cwd, "node_modules", ".bin"), { recursive: true });
    await writeFile(
      path.join(cwd, "node_modules", ".bin", "tsc.cmd"),
      "@echo typecheck failed\r\n@exit /b 2\r\n"
    );

    const result = await runCli(
      cwd,
      ["dev", "--once", "--template", "node", "--typecheck", "enable"],
      {
        stdin: "y\n",
        env: {
          SYNCORE_FORCE_INTERACTIVE: "1"
        }
      }
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Typecheck failed.");
  }, 20_000);

  test("dev --once --tail-logs errors prints recent runtime signals on bootstrap failure", async () => {
    const cwd = await createTempProjectDirectory();
    await writeWorkspaceTsconfig(cwd);
    await runCli(cwd, ["init", "--template", "node", "--yes"]);
    await mkdir(path.join(cwd, ".syncore", "logs"), { recursive: true });
    await writeFile(
      path.join(cwd, ".syncore", "logs", "runtime.jsonl"),
      `${JSON.stringify({
        version: 2,
        timestamp: Date.now(),
        runtimeId: "runtime-a",
        targetId: "project",
        runtimeLabel: "project",
        origin: "runtime",
        eventType: "log",
        category: "system",
        message: "Last useful runtime context",
        event: {}
      })}\n`
    );
    await writeFile(
      path.join(cwd, "syncore", "schema.ts"),
      "export default (() => {\n"
    );

    const result = await runCli(cwd, [
      "dev",
      "--once",
      "--template",
      "node",
      "--tail-logs",
      "errors"
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Recent runtime signals:");
    expect(result.stdout).toContain("Last useful runtime context");
  }, 20_000);

  test("dev --once ready summary includes codegen, drift, and typecheck status", async () => {
    const cwd = await createTempProjectDirectory();
    await writeWorkspaceTsconfig(cwd);

    const result = await runCli(
      cwd,
      ["dev", "--once", "--template", "node", "--typecheck", "try"],
      {
        stdin: "y\n",
        env: {
          SYNCORE_FORCE_INTERACTIVE: "1"
        }
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("codegen: refreshed");
    expect(result.stdout).toContain("drift:");
    expect(result.stdout).toContain("typecheck:");
  }, 20_000);

  test("migrate status/generate/apply work through the grouped subcommands", async () => {
    const cwd = await createTempProjectDirectory();
    await writeWorkspaceTsconfig(cwd);
    await runCli(cwd, ["init", "--template", "node", "--yes"]);

    const generateResult = await runCli(cwd, ["migrate", "generate", "initial", "--json"]);
    expect(generateResult.exitCode).toBe(0);
    const generatePayload = JSON.parse(generateResult.stdout) as {
      command: string;
      data: {
        path: string;
        statements: string[];
      };
    };
    expect(generatePayload.command).toBe("migrate generate");
    expect(generatePayload.data.statements.length).toBeGreaterThan(0);
    expect(await exists(path.join(cwd, generatePayload.data.path))).toBe(true);

    const applyResult = await runCli(cwd, ["migrate", "apply", "--json"]);
    expect(applyResult.exitCode).toBe(0);
    const database = new DatabaseSync(path.join(cwd, ".syncore", "syncore.db"));
    const tasksTable = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tasks'"
      )
      .get() as { name: string } | undefined;
    const appliedMigrations = database
      .prepare("SELECT COUNT(*) AS count FROM _syncore_migrations")
      .get() as { count: number };
    database.close();
    expect(tasksTable?.name).toBe("tasks");
    expect(appliedMigrations.count).toBe(1);

    const statusResult = await runCli(cwd, ["migrate", "status", "--json"]);
    expect(statusResult.exitCode).toBe(0);
    const statusPayload = JSON.parse(statusResult.stdout) as {
      command: string;
      data: {
        statements: string[];
        destructiveChanges: string[];
      };
    };
    expect(statusPayload.command).toBe("migrate status");
    expect(statusPayload.data.statements).toEqual([]);
    expect(statusPayload.data.destructiveChanges).toEqual([]);
  }, 30_000);

  test("run, data, export, and import work against the local runtime", async () => {
    const sourceCwd = await createTempProjectDirectory();
    await writeWorkspaceTsconfig(sourceCwd);
    await runCli(sourceCwd, ["init", "--template", "node", "--yes"]);
    await runCli(sourceCwd, ["migrate", "generate", "initial"]);
    await runCli(sourceCwd, ["migrate", "apply"]);

    const mutationResult = await runCli(sourceCwd, [
      "run",
      "tasks/create",
      '{"text":"Ship Syncore"}',
      "--target",
      "project"
    ]);
    expect(mutationResult.exitCode).toBe(0);

    const queryResult = await runCli(sourceCwd, [
      "run",
      "api.tasks.list",
      "{}",
      "--json",
      "--target",
      "project",
      "--format",
      "json"
    ]);
    expect(queryResult.exitCode).toBe(0);
    const queriedTasks = JSON.parse(queryResult.stdout) as Array<{ text: string }>;
    expect(queriedTasks.map((task) => task.text)).toContain("Ship Syncore");

    const dataResult = await runCli(sourceCwd, [
      "data",
      "tasks",
      "--json",
      "--target",
      "project",
      "--format",
      "json"
    ]);
    expect(dataResult.exitCode).toBe(0);
    const taskRows = JSON.parse(dataResult.stdout) as Array<{ text: string }>;
    expect(taskRows.map((task) => task.text)).toContain("Ship Syncore");

    const exportPath = path.join(sourceCwd, "tasks.jsonl");
    const exportResult = await runCli(sourceCwd, [
      "export",
      "--table",
      "tasks",
      "--target",
      "project",
      "--path",
      exportPath
    ]);
    expect(exportResult.exitCode).toBe(0);
    expect(await exists(exportPath)).toBe(true);
    const exportedRows = (await readFile(exportPath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { text: string });
    expect(exportedRows.map((row) => row.text)).toContain("Ship Syncore");

    const targetCwd = await createTempProjectDirectory();
    await writeWorkspaceTsconfig(targetCwd);
    await runCli(targetCwd, ["init", "--template", "node", "--yes"]);
    await runCli(targetCwd, ["migrate", "generate", "initial"]);
    await runCli(targetCwd, ["migrate", "apply"]);

    const importResult = await runCli(targetCwd, [
      "import",
      "--table",
      "tasks",
      "--target",
      "project",
      exportPath
    ]);
    expect(importResult.exitCode).toBe(0);

    const database = new DatabaseSync(path.join(targetCwd, ".syncore", "syncore.db"));
    const importedTask = database
      .prepare('SELECT json_extract(_json, \'$.text\') AS text FROM "tasks"')
      .get() as { text: string };
    database.close();
    expect(importedTask.text).toBe("Ship Syncore");
  }, 90_000);

  test("--runtime requires --target", async () => {
    const cwd = await createTempProjectDirectory();
    await writeWorkspaceTsconfig(cwd);
    await runCli(cwd, ["init", "--template", "node", "--yes"]);

    const result = await runCli(cwd, [
      "run",
      "tasks/list",
      "{}",
      "--json",
      "--runtime",
      "20318"
    ]);

    expect(result.exitCode).toBe(1);
    const payload = JSON.parse(result.stdout) as {
      error: { message: string; exitCode: number };
    };
    expect(payload.error.exitCode).toBe(1);
    expect(payload.error.message).toContain("requires --target");
  });

  test("--runtime is rejected for the project target", async () => {
    const cwd = await createTempProjectDirectory();
    await writeWorkspaceTsconfig(cwd);
    await runCli(cwd, ["init", "--template", "node", "--yes"]);

    const result = await runCli(cwd, [
      "run",
      "tasks/list",
      "{}",
      "--target",
      "project",
      "--runtime",
      "20318",
      "--json"
    ]);

    expect(result.exitCode).toBe(1);
    const payload = JSON.parse(result.stdout) as {
      error: { category: string; message: string };
    };
    expect(payload.error.category).toBe("target");
    expect(payload.error.message).toContain("does not accept --runtime for the project target");
  });

  test("resolveClientRuntime lists available runtimes for invalid runtime ids", () => {
    const target: ClientTargetDescriptor = {
      id: "61747",
      kind: "client",
      label: "localhost",
      runtimeId: "runtime-a",
      runtimeIds: ["runtime-a", "runtime-b"],
      runtimes: [
        {
          id: "A203",
          runtimeId: "runtime-a",
          label: "tab-a",
          platform: "browser-worker",
          online: true,
          primary: true
        },
        {
          id: "B402",
          runtimeId: "runtime-b",
          label: "tab-b",
          platform: "browser-worker",
          online: true,
          primary: false
        }
      ],
      platform: "browser-worker",
      connectedSessions: 2,
      online: true,
      capabilities: ["run", "readData", "writeData", "exportData", "streamLogs"],
      sessionLabels: ["tab-a", "tab-b"]
    };

    expect(() =>
      resolveClientRuntime(target, "Z999", {
        command: "logs"
      })
    ).toThrowError(/Unknown runtime/);
  });

  test("logs hide hub heartbeat entries in normal output", async () => {
    const cwd = await createTempProjectDirectory();
    await writeWorkspaceTsconfig(cwd);
    await mkdir(path.join(cwd, ".syncore", "logs"), { recursive: true });
    await writeFile(
      path.join(cwd, ".syncore", "logs", "runtime.jsonl"),
      [
        JSON.stringify({
          version: 2,
          timestamp: Date.now() - 1000,
          runtimeId: "syncore-dev-hub",
          targetId: "all",
          runtimeLabel: "dashboard",
          origin: "dashboard",
          eventType: "log",
          category: "system",
          message: "Syncore devtools hub is alive.",
          event: {}
        }),
        JSON.stringify({
          version: 2,
          timestamp: Date.now(),
          runtimeId: "runtime-a",
          targetId: "61747",
          runtimeLabel: "tab-a",
          publicRuntimeId: "20318",
          origin: "runtime",
          eventType: "query.executed",
          category: "query",
          message: "tasks/list executed",
          event: {}
        })
      ].join("\n")
    );

    const result = await runCli(cwd, ["logs"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("hub is alive");
    expect(result.stdout).toContain("tasks/list executed");
    expect(result.stdout).toContain("20318 tab-a");
  });

  test("dashboard returns JSON-friendly output", async () => {
    const result = await runCli(workspaceRoot, ["dashboard", "--json"]);
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout) as { data: { url: string } };
    expect(payload.data.url).toContain("http://localhost:");
  });

  test("dashboard returns the authenticated URL when a devtools session exists", async () => {
    const cwd = await createTempProjectDirectory();
    await writeWorkspaceTsconfig(cwd);
    await mkdir(path.join(cwd, ".syncore"), { recursive: true });
    await writeFile(
      path.join(cwd, ".syncore", "devtools-session.json"),
      `${JSON.stringify({
        dashboardUrl: "http://localhost:4310",
        authenticatedDashboardUrl: "http://localhost:4310/?token=abc123",
        devtoolsUrl: "ws://127.0.0.1:4311",
        token: "abc123"
      })}\n`
    );

    const result = await runCli(cwd, ["dashboard", "--json"]);
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout) as {
      data: { url: string; baseUrl: string };
    };
    expect(payload.data.url).toBe("http://localhost:4310/?token=abc123");
    expect(payload.data.baseUrl).toBe("http://localhost:4310");
  });

  test("targets lists the local project target for node templates", async () => {
    const cwd = await createTempProjectDirectory();
    await writeWorkspaceTsconfig(cwd);
    await runCli(cwd, ["init", "--template", "node", "--yes"]);

    const result = await runCli(cwd, ["targets", "--json"]);
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout) as {
      command: string;
      data: Array<{
        id: string;
        kind: string;
        capabilities: string[];
      }>;
    };
    expect(payload.command).toBe("targets");
    expect(payload.data.some((entry) => entry.id === "project")).toBe(true);
    expect(payload.data.find((entry) => entry.id === "project")?.capabilities).toContain("run");
  });

  test("targets default output includes client runtime rows", () => {
    const printed = captureStdout(() =>
      printTargetsTable([
        {
          id: "61747",
          kind: "client",
          label: "localhost (2 sessions)",
          runtimeId: "runtime-a-12345678",
          runtimeIds: ["runtime-a-12345678", "runtime-b-87654321"],
          runtimes: [
            {
              id: "20318",
              runtimeId: "runtime-a-12345678",
              label: "browser-worker",
              platform: "browser-worker",
              origin: "http://localhost:3000",
              online: true,
              primary: true
            },
            {
              id: "40291",
              runtimeId: "runtime-b-87654321",
              label: "browser-worker",
              platform: "browser-worker",
              origin: "http://localhost:3000",
              online: true,
              primary: false
            }
          ],
          platform: "browser-worker",
          connectedSessions: 2,
          online: true,
          capabilities: ["run", "readData", "writeData", "exportData", "streamLogs"],
          origin: "http://localhost:3000",
          storageProtocol: "opfs",
          sessionLabels: ["tab-a", "tab-b"]
        }
      ])
    );

    expect(printed).toContain("runtime 20318  browser-worker  primary");
    expect(printed).toContain("runtime 40291  browser-worker");
    expect(printed).toContain(
      "origin: http://localhost:3000  platform: browser-worker  status: online"
    );
  });

  test("JSON errors expose category, details, and next steps", async () => {
    const cwd = await createTempProjectDirectory();
    await writeWorkspaceTsconfig(cwd);
    await runCli(cwd, ["init", "--template", "node", "--yes"]);

    const result = await runCli(cwd, [
      "run",
      "tasks/list",
      "{}",
      "--target",
      "12345",
      "--json"
    ]);
    expect(result.exitCode).toBe(1);
    const payload = JSON.parse(result.stdout) as {
      error: {
        category: string;
        nextSteps?: string[];
        details?: {
          availableTargets?: string[];
        };
      };
    };
    expect(payload.error.category).toBe("target");
    expect(payload.error.nextSteps?.length).toBeGreaterThan(0);
    expect(payload.error.details?.availableTargets ?? []).toContain("project");
  });

  test("legacy client target syntax is rejected explicitly", async () => {
    const cwd = await createTempProjectDirectory();
    await writeWorkspaceTsconfig(cwd);
    await runCli(cwd, ["init", "--template", "node", "--yes"]);

    const result = await runCli(cwd, [
      "run",
      "tasks/list",
      "{}",
      "--target",
      "client:abc123",
      "--json"
    ]);
    expect(result.exitCode).toBe(1);
    const payload = JSON.parse(result.stdout) as {
      error: {
        category: string;
        details?: {
          expected?: string;
        };
      };
    };
    expect(payload.error.category).toBe("target");
    expect(payload.error.details?.expected).toBe("project or a 5-digit target id");
  });

  test("public client target ids are stable 5-digit codes", () => {
    const keys = ["storage:alpha", "storage:beta"];
    const alpha = createPublicClientTargetId("storage:alpha", keys);
    const beta = createPublicClientTargetId("storage:beta", keys);

    expect(alpha).toMatch(/^\d{5}$/);
    expect(beta).toMatch(/^\d{5}$/);
    expect(createPublicClientTargetId("storage:alpha", keys)).toBe(alpha);
    expect(alpha).not.toBe(beta);
  });

  test("public client target ids resolve collisions deterministically", () => {
    const seen = new Map<string, string>();
    let pair: [string, string] | null = null;
    for (let index = 0; index < 2000; index += 1) {
      const key = `collision:${index}`;
      const candidate = createBasePublicClientTargetId(key);
      const existing = seen.get(candidate);
      if (existing) {
        pair = [existing, key];
        break;
      }
      seen.set(candidate, key);
    }
    if (!pair) {
      throw new Error("Failed to find a collision fixture.");
    }
    const left = createPublicClientTargetId(pair[0], pair);
    const right = createPublicClientTargetId(pair[1], pair);

    expect(left).toMatch(/^\d{5}$/);
    expect(right).toMatch(/^\d{5}$/);
    expect(left).not.toBe(right);
    expect(createPublicClientTargetId(pair[0], pair)).toBe(left);
    expect(createPublicClientTargetId(pair[1], pair)).toBe(right);
  });

  test("public runtime ids are stable letter-plus-3-digit codes", () => {
    const ids = ["runtime-a", "runtime-b"];
    const left = createPublicRuntimeId("runtime-a", ids);
    const right = createPublicRuntimeId("runtime-b", ids);

    expect(left).toMatch(/^[A-Z]\d{3}$/);
    expect(right).toMatch(/^[A-Z]\d{3}$/);
    expect(createPublicRuntimeId("runtime-a", ids)).toBe(left);
    expect(left).not.toBe(right);
  });
});

async function createTempProjectDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "syncore-cli-"));
  tempDirectories.push(directory);
  return directory;
}

async function writeWorkspaceTsconfig(cwd: string): Promise<void> {
  const configPath = path.join(cwd, "tsconfig.json");
  const extendsPath = path
    .relative(cwd, path.join(workspaceRoot, "tsconfig.base.json"))
    .replaceAll("\\", "/");

  await writeFile(
    configPath,
    `${JSON.stringify(
      {
        extends: extendsPath.startsWith(".") ? extendsPath : `./${extendsPath}`
      },
      null,
      2
    )}\n`
  );
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function createCliProcessEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    TSX_TSCONFIG_PATH: tsxTsconfigPath,
    ...extra
  };
}

async function removeDirectoryWithRetry(directory: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error)) {
        throw error;
      }
      if (error.code !== "EBUSY" && error.code !== "ENOTEMPTY") {
        throw error;
      }
      await sleep(100 * (attempt + 1));
    }
  }

  await rm(directory, { recursive: true, force: true });
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function captureStdout(callback: () => void): string {
  let output = "";
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  try {
    callback();
  } finally {
    process.stdout.write = originalWrite;
  }
  return output;
}

async function runCli(
  cwd: string,
  args: string[],
  options: {
    env?: NodeJS.ProcessEnv;
    stdin?: string;
  } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", tsxRegisterPath, cliEntryPath, ...args],
      {
        cwd,
        env: createCliProcessEnv(options.env),
        stdio: ["pipe", "pipe", "pipe"]
      }
    );
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
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1
      });
    });

    if (!child.stdin) {
      reject(new Error("Expected stdin to be available for the spawned CLI."));
      return;
    }

    if (options.stdin) {
      child.stdin.write(options.stdin);
    }
    child.stdin.end();
  });
}
