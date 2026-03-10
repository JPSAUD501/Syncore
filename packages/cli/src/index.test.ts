import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

const cliRoot = import.meta.dirname;
const workspaceRoot = path.resolve(cliRoot, "..", "..", "..");
const cliEntryPath = path.resolve(workspaceRoot, "packages", "cli", "src", "index.ts");
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
    await rm(directory, { recursive: true, force: true });
  }
});

describe("syncore CLI", () => {
  test("root help exposes the new product command surface", async () => {
    const result = await runCli(workspaceRoot, ["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Recommended flow:");
    expect(result.stdout).toContain("migrate");
    expect(result.stdout).toContain("run [options] <functionName> [args]");
    expect(result.stdout).toContain("data [options] [table]");
    expect(result.stdout).toContain("export [options]");
    expect(result.stdout).toContain("logs [options]");
    expect(result.stdout).toContain("targets [options]");
    expect(result.stdout).toContain("dashboard [options]");
    expect(result.stdout).toContain("docs [options]");
    expect(result.stdout).not.toContain("seed");
  });

  test("root version is exposed", async () => {
    const result = await runCli(workspaceRoot, ["--version"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("0.1.0");
  });

  test("init scaffolds a project and codegen remains stable", async () => {
    const cwd = await createTempProjectDirectory();
    await writeWorkspaceTsconfig(cwd);

    const initResult = await runCli(cwd, ["init", "--template", "node", "--yes"]);
    expect(initResult.exitCode).toBe(0);
    expect(initResult.stdout).toContain("Syncore scaffolded with the node template.");

    const generatedApiPath = path.join(cwd, "syncore", "_generated", "api.ts");
    const generatedFunctionsPath = path.join(cwd, "syncore", "_generated", "functions.ts");
    const generatedServerPath = path.join(cwd, "syncore", "_generated", "server.ts");
    const configPath = path.join(cwd, "syncore.config.ts");
    const firstGeneratedApi = await readFile(generatedApiPath, "utf8");
    const firstGeneratedFunctions = await readFile(generatedFunctionsPath, "utf8");
    const firstGeneratedServer = await readFile(generatedServerPath, "utf8");
    const configSource = await readFile(configPath, "utf8");

    expect(firstGeneratedApi).toContain("readonly tasks: SyncoreApi__tasks;");
    expect(firstGeneratedFunctions).toContain('"tasks/create"');
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
    expect(result.stderr).toContain("Scaffolding cancelled by user.");
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

  test("doctor --verbose prints resolved context details", async () => {
    const cwd = await createTempProjectDirectory();
    await writeWorkspaceTsconfig(cwd);
    await runCli(cwd, ["init", "--template", "node", "--yes"]);

    const result = await runCli(cwd, ["doctor", "--verbose"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("cwd:");
    expect(result.stdout).toContain("ports: dashboard=");
    expect(result.stdout).toContain("project target:");
  });

  test("dev --once fails non-interactively when the project is missing", async () => {
    const cwd = await createTempProjectDirectory();
    await writeWorkspaceTsconfig(cwd);

    const result = await runCli(cwd, ["dev", "--once", "--template", "node"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("No Syncore project was found");
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
    expect(result.stdout).toContain("Starting Syncore local dev session...");
    expect(result.stdout).toContain("Project");
    expect(result.stdout).toContain("Codegen");
    expect(result.stdout).toContain("Schema");
    expect(result.stdout).toContain("Syncore dev bootstrap completed.");
    expect(result.stdout).toContain("Ready:");
    expect(result.stdout).toContain("dashboard: http://localhost:");
    expect(result.stdout).not.toContain("127.0.0.1");
    expect(await exists(path.join(cwd, "syncore.config.ts"))).toBe(true);
    expect(await exists(path.join(cwd, ".syncore", "syncore.db"))).toBe(true);
  }, 20_000);

  test("migrate status/generate/apply work through the grouped subcommands", async () => {
    const cwd = await createTempProjectDirectory();
    await writeWorkspaceTsconfig(cwd);
    await runCli(cwd, ["init", "--template", "node", "--yes"]);

    const generateResult = await runCli(cwd, ["migrate", "generate", "initial"]);
    expect(generateResult.exitCode).toBe(0);
    expect(generateResult.stdout).toContain("Generated syncore/migrations/0001_initial.sql.");

    const applyResult = await runCli(cwd, ["migrate", "apply"]);
    expect(applyResult.exitCode).toBe(0);
    expect(applyResult.stdout).toContain("Applied 1 migration(s).");

    const statusResult = await runCli(cwd, ["migrate", "status"]);
    expect(statusResult.exitCode).toBe(0);
    expect(statusResult.stdout).toContain("Statements to generate: 0");
    expect(statusResult.stdout).toContain("Destructive changes: 0");
  }, 20_000);

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
      "--target",
      "project",
      "--format",
      "json"
    ]);
    expect(queryResult.exitCode).toBe(0);
    expect(queryResult.stdout).toContain("Ship Syncore");

    const dataResult = await runCli(sourceCwd, [
      "data",
      "tasks",
      "--target",
      "project",
      "--format",
      "json"
    ]);
    expect(dataResult.exitCode).toBe(0);
    expect(dataResult.stdout).toContain("Ship Syncore");

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
    expect(importResult.stdout).toContain("Imported 1 row(s).");

    const database = new DatabaseSync(path.join(targetCwd, ".syncore", "syncore.db"));
    const count = database
      .prepare('SELECT COUNT(*) AS count FROM "tasks"')
      .get() as { count: number };
    database.close();
    expect(count.count).toBe(1);
  }, 45_000);

  test("dashboard returns JSON-friendly output", async () => {
    const result = await runCli(workspaceRoot, ["dashboard", "--json"]);
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout) as { data: { url: string } };
    expect(payload.data.url).toContain("http://localhost:");
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

  test("targets --verbose includes project target details", async () => {
    const cwd = await createTempProjectDirectory();
    await writeWorkspaceTsconfig(cwd);
    await runCli(cwd, ["init", "--template", "node", "--yes"]);

    const result = await runCli(cwd, ["targets", "--verbose"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("project:");
    expect(result.stdout).toContain("storage:");
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
      "missing",
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
    expect(payload.error.details?.availableTargets).toContain("project");
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
