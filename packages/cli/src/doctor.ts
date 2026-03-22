import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  createSchemaSnapshot,
  diffSchemaSnapshots,
  type SchemaSnapshot
} from "@syncore/core";
import {
  detectProjectTemplate,
  fileExists,
  formatError,
  hasSyncoreProject,
  isLocalPortInUse,
  loadProjectSchema,
  readStoredSnapshot,
  runCodegen,
  writeStoredSnapshot
} from "@syncore/core/cli";
import type {
  ClientTargetDescriptor,
  SyncoreTargetDescriptor,
  WorkspaceProjectMatch
} from "./project.js";
import {
  findWorkspaceSyncoreProjects,
  listConnectedClientTargets,
  resolveDashboardUrl,
  resolveDevtoolsUrl,
  resolveProjectTargetDescriptor
} from "./project.js";
import { templateUsesConnectedClients } from "./messages.js";

export type DoctorStatus =
  | "ready"
  | "workspace-root"
  | "missing-project"
  | "missing-generated"
  | "schema-drift"
  | "schema-destructive-drift"
  | "hub-down"
  | "waiting-for-client";

export type DoctorCheckCategory = "project" | "generated" | "schema";
export type DiagnosticCategory =
  | "project"
  | "generated"
  | "schema"
  | "hub"
  | "runtime"
  | "persistence"
  | "client";
export type DiagnosticSeverity = "info" | "warning" | "error";
export type DiagnosticStatus = "pass" | "warn" | "fail";

export interface DoctorCheck {
  category: DoctorCheckCategory;
  path: string;
  ok: boolean;
}

export interface JourneyDiagnostic {
  id: string;
  category: DiagnosticCategory;
  severity: DiagnosticSeverity;
  status: DiagnosticStatus;
  summary: string;
  details?: string;
  suggestedAction?: string;
  canAutoFix: boolean;
  fixCommand?: string;
}

export interface DoctorPrimaryIssue {
  code: DoctorStatus;
  summary: string;
  details: string;
  impact: string;
  suggestedAction?: string;
}

export interface RuntimeSignalEntry {
  timestamp: number;
  category: "query" | "mutation" | "action" | "system";
  message: string;
  targetId: string;
  runtimeLabel?: string;
}

export interface RuntimeSignals {
  logFilePath: string;
  logFilePresent: boolean;
  logEntryCount: number;
  recent: RuntimeSignalEntry[];
  sessionState: "present" | "missing" | "invalid";
  sessionPath: string;
}

export interface DriftState {
  state:
    | "clean"
    | "missing-snapshot"
    | "snapshot-outdated"
    | "migration-pending"
    | "destructive"
    | "unavailable";
  currentSchemaHash: string | null;
  storedSchemaHash: string | null;
  statements: string[];
  warnings: string[];
  destructiveChanges: string[];
  details?: string;
}

export interface DoctorReport {
  cwd: string;
  template: string;
  status: DoctorStatus;
  primaryIssue: DoctorPrimaryIssue;
  diagnostics: JourneyDiagnostic[];
  autoFixesAvailable: boolean;
  drift: DriftState;
  runtimeSignals: RuntimeSignals;
  checks: DoctorCheck[];
  workspaceMatches: WorkspaceProjectMatch[];
  suggestions: string[];
  projectTarget: Awaited<ReturnType<typeof resolveProjectTargetDescriptor>>;
  targets: SyncoreTargetDescriptor[];
  hub: {
    url: string;
    dashboardUrl: string;
    running: boolean;
    dashboardRunning: boolean;
    ports: {
      devtools: number;
      dashboard: number;
    };
  };
}

interface SessionInspection {
  state: RuntimeSignals["sessionState"];
  path: string;
}

interface LoadedSchemaDrift {
  currentSnapshot: SchemaSnapshot | null;
  storedSnapshot: SchemaSnapshot | null;
  drift: DriftState;
}

interface PersistedLogEntryLike {
  version?: number;
  timestamp: number;
  category: "query" | "mutation" | "action" | "system";
  message: string;
  targetId?: string;
  runtimeLabel?: string;
}

const STRUCTURE_CHECKS = [
  { category: "project" as const, path: "syncore.config.ts" },
  { category: "schema" as const, path: path.join("syncore", "schema.ts") },
  {
    category: "project" as const,
    path: path.join("syncore", "components.ts"),
    optional: true
  },
  { category: "project" as const, path: path.join("syncore", "functions") },
  {
    category: "generated" as const,
    path: path.join("syncore", "_generated", "api.ts")
  },
  {
    category: "generated" as const,
    path: path.join("syncore", "_generated", "components.ts")
  },
  {
    category: "generated" as const,
    path: path.join("syncore", "_generated", "schema.ts")
  },
  {
    category: "generated" as const,
    path: path.join("syncore", "_generated", "functions.ts")
  },
  {
    category: "generated" as const,
    path: path.join("syncore", "_generated", "server.ts")
  },
  { category: "schema" as const, path: path.join("syncore", "migrations") }
] as const;

export async function buildDoctorReport(cwd: string): Promise<DoctorReport> {
  const template = await detectProjectTemplate(cwd);
  const checks = await Promise.all(
    STRUCTURE_CHECKS.map(async (entry) => ({
      category: entry.category,
      path: entry.path.replaceAll("\\", "/"),
      ok:
        (await fileExists(path.join(cwd, entry.path))) ||
        ("optional" in entry && entry.optional === true)
    }))
  );
  const hasProject = await hasSyncoreProject(cwd);

  let projectTarget: Awaited<ReturnType<typeof resolveProjectTargetDescriptor>> = null;
  let persistenceDetails: string | undefined;
  try {
    projectTarget = await resolveProjectTargetDescriptor(cwd);
    if (projectTarget) {
      persistenceDetails = `Database path: ${projectTarget.databasePath}. Storage directory: ${projectTarget.storageDirectory}.`;
    }
  } catch (error) {
    persistenceDetails = formatError(error);
  }
  const usesConnectedClients =
    templateUsesConnectedClients(template) ||
    (!projectTarget && template !== "node");

  const clientTargets = await listConnectedClientTargets();
  const targets: SyncoreTargetDescriptor[] = [
    ...(projectTarget ? [projectTarget] : []),
    ...clientTargets
  ];

  const devtoolsUrl = resolveDevtoolsUrl();
  const dashboardUrl = resolveDashboardUrl();
  const hubPort = Number.parseInt(new URL(devtoolsUrl).port, 10);
  const dashboardPort = Number.parseInt(new URL(dashboardUrl).port, 10);
  const hub = {
    url: devtoolsUrl,
    dashboardUrl,
    running:
      Number.isFinite(hubPort) && hubPort > 0
        ? await isLocalPortInUse(hubPort)
        : false,
    dashboardRunning:
      Number.isFinite(dashboardPort) && dashboardPort > 0
        ? await isLocalPortInUse(dashboardPort)
        : false,
    ports: {
      devtools: hubPort,
      dashboard: dashboardPort
    }
  };

  const workspaceMatches = hasProject ? [] : await findWorkspaceSyncoreProjects(cwd);
  const runtimeSignals = await inspectRuntimeSignals(cwd);
  const loadedDrift = await loadSchemaDrift(cwd, checks);
  const drift = loadedDrift?.drift ?? {
    state: "unavailable",
    currentSchemaHash: null,
    storedSchemaHash: null,
    statements: [],
    warnings: [],
    destructiveChanges: [],
    details: "Syncore could not inspect schema drift yet."
  };

  const diagnostics = buildDiagnostics({
    checks,
    drift,
    hasProject,
    hub,
    projectTarget,
    runtimeSignals,
    template,
    usesConnectedClients,
    clientTargets,
    ...(persistenceDetails ? { persistenceDetails } : {})
  });

  const primaryIssue = resolvePrimaryIssue({
    checks,
    diagnostics,
    drift,
    hasProject,
    hubRunning: hub.running,
    usesConnectedClients,
    clientTargets,
    workspaceMatches
  });

  const suggestions = collectSuggestions(primaryIssue, diagnostics, workspaceMatches);

  return {
    cwd,
    template,
    status: primaryIssue.code,
    primaryIssue,
    diagnostics,
    autoFixesAvailable: diagnostics.some(
      (diagnostic) => diagnostic.canAutoFix && diagnostic.status !== "pass"
    ),
    drift,
    runtimeSignals,
    checks,
    workspaceMatches,
    suggestions,
    projectTarget,
    targets,
    hub
  };
}

export async function applyDoctorFixes(
  cwd: string,
  report?: DoctorReport
): Promise<string[]> {
  const appliedFixes: string[] = [];
  const currentReport = report ?? (await buildDoctorReport(cwd));
  const missingGenerated = currentReport.checks.some(
    (check) => check.category === "generated" && !check.ok
  );

  if (missingGenerated) {
    await runCodegen(cwd);
    appliedFixes.push("Regenerated syncore/_generated/*.");
  }

  const refreshedReport =
    missingGenerated || !report ? await buildDoctorReport(cwd) : currentReport;
  if (
    refreshedReport.drift.state === "missing-snapshot" ||
    refreshedReport.drift.state === "snapshot-outdated" ||
    refreshedReport.drift.state === "migration-pending"
  ) {
    const generatedSchemaPath = path.join(cwd, "syncore", "_generated", "schema.ts");
    if (await fileExists(generatedSchemaPath)) {
      const schema = await loadProjectSchema(cwd);
      const snapshot = createSchemaSnapshot(schema);
      await writeStoredSnapshot(cwd, snapshot);
      appliedFixes.push("Refreshed the stored schema snapshot.");
    }
  }

  return appliedFixes;
}

async function inspectRuntimeSignals(cwd: string): Promise<RuntimeSignals> {
  const session = await inspectDevtoolsSession(cwd);
  const logFilePath = path.join(cwd, ".syncore", "logs", "runtime.jsonl");
  if (!(await fileExists(logFilePath))) {
    return {
      logFilePath,
      logFilePresent: false,
      logEntryCount: 0,
      recent: [],
      sessionState: session.state,
      sessionPath: session.path
    };
  }

  try {
    const source = await readFile(logFilePath, "utf8");
    const entries = source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as PersistedLogEntryLike)
      .filter((entry) => entry.version === 2);

    return {
      logFilePath,
      logFilePresent: true,
      logEntryCount: entries.length,
      recent: entries.slice(-5).map((entry) => ({
        timestamp: entry.timestamp,
        category: entry.category,
        message: entry.message,
        targetId: entry.targetId ?? "unknown",
        ...(entry.runtimeLabel ? { runtimeLabel: entry.runtimeLabel } : {})
      })),
      sessionState: session.state,
      sessionPath: session.path
    };
  } catch (error) {
    return {
      logFilePath,
      logFilePresent: true,
      logEntryCount: 0,
      recent: [
        {
          timestamp: Date.now(),
          category: "system",
          message: `Unable to read runtime log history: ${formatError(error)}`,
          targetId: "system"
        }
      ],
      sessionState: session.state,
      sessionPath: session.path
    };
  }
}

async function inspectDevtoolsSession(cwd: string): Promise<SessionInspection> {
  const sessionPath = path.join(cwd, ".syncore", "devtools-session.json");
  if (!(await fileExists(sessionPath))) {
    return { state: "missing", path: sessionPath };
  }

  try {
    const source = await readFile(sessionPath, "utf8");
    const parsed = JSON.parse(source) as Partial<{
      dashboardUrl: string;
      authenticatedDashboardUrl: string;
      devtoolsUrl: string;
      token: string;
    }>;
    const valid =
      typeof parsed.dashboardUrl === "string" &&
      typeof parsed.authenticatedDashboardUrl === "string" &&
      typeof parsed.devtoolsUrl === "string" &&
      typeof parsed.token === "string";
    return {
      state: valid ? "present" : "invalid",
      path: sessionPath
    };
  } catch {
    return { state: "invalid", path: sessionPath };
  }
}

async function loadSchemaDrift(
  cwd: string,
  checks: DoctorCheck[]
): Promise<LoadedSchemaDrift | null> {
  const generatedSchemaPresent = checks.some(
    (check) => check.path === "syncore/_generated/schema.ts" && check.ok
  );
  if (!generatedSchemaPresent) {
    return null;
  }

  try {
    const schema = await loadProjectSchema(cwd);
    const currentSnapshot = createSchemaSnapshot(schema);
    const storedSnapshot = await readStoredSnapshot(cwd);
    const plan = diffSchemaSnapshots(storedSnapshot, currentSnapshot);
    const state =
      plan.destructiveChanges.length > 0
        ? "destructive"
        : !storedSnapshot
          ? "missing-snapshot"
          : storedSnapshot.hash !== currentSnapshot.hash && plan.statements.length > 0
            ? "migration-pending"
            : storedSnapshot.hash !== currentSnapshot.hash
              ? "snapshot-outdated"
              : "clean";
    return {
      currentSnapshot,
      storedSnapshot,
      drift: {
        state,
        currentSchemaHash: currentSnapshot.hash,
        storedSchemaHash: storedSnapshot?.hash ?? null,
        statements: plan.statements,
        warnings: plan.warnings,
        destructiveChanges: plan.destructiveChanges,
        details:
          state === "clean"
            ? "Local schema snapshot matches the generated Syncore schema."
            : describeDriftState(state, plan.statements.length, plan.warnings.length)
      }
    };
  } catch (error) {
    return {
      currentSnapshot: null,
      storedSnapshot: null,
      drift: {
        state: "unavailable",
        currentSchemaHash: null,
        storedSchemaHash: null,
        statements: [],
        warnings: [],
        destructiveChanges: [],
        details: `Syncore could not load the generated schema: ${formatError(error)}`
      }
    };
  }
}

function describeDriftState(
  state: DriftState["state"],
  statementCount: number,
  warningCount: number
): string {
  if (state === "missing-snapshot") {
    return "No stored schema snapshot was found yet.";
  }
  if (state === "migration-pending") {
    return `Schema drift detected with ${statementCount} SQL statement(s) pending and ${warningCount} warning(s).`;
  }
  if (state === "snapshot-outdated") {
    return "The stored schema snapshot differs from the generated schema, but no SQL statements are pending.";
  }
  if (state === "destructive") {
    return "The current schema diff includes destructive changes that require manual review.";
  }
  return "Syncore could not inspect schema drift.";
}

function buildDiagnostics(input: {
  checks: DoctorCheck[];
  drift: DriftState;
  hasProject: boolean;
  hub: DoctorReport["hub"];
  persistenceDetails?: string;
  projectTarget: DoctorReport["projectTarget"];
  runtimeSignals: RuntimeSignals;
  template: string;
  usesConnectedClients: boolean;
  clientTargets: ClientTargetDescriptor[];
}): JourneyDiagnostic[] {
  const diagnostics: JourneyDiagnostic[] = [];
  const missingProjectPaths = input.checks.filter(
    (check) => (check.category === "project" || check.category === "schema") && !check.ok
  );
  diagnostics.push(
    missingProjectPaths.length === 0 && input.hasProject
      ? {
          id: "project.structure",
          category: "project",
          severity: "info",
          status: "pass",
          summary: "Syncore project structure is present.",
          details: "Core project files are available in this directory.",
          canAutoFix: false
        }
      : {
          id: "project.structure",
          category: "project",
          severity: "error",
          status: "fail",
          summary: "Syncore project structure is incomplete or missing.",
          details:
            missingProjectPaths.length > 0
              ? `Missing: ${missingProjectPaths.map((check) => check.path).join(", ")}.`
              : "This directory does not contain a full Syncore project yet.",
          suggestedAction: "Run `npx syncorejs init` or restore the missing project files.",
          canAutoFix: false
        }
  );

  const missingGenerated = input.checks.filter(
    (check) => check.category === "generated" && !check.ok
  );
  diagnostics.push(
    missingGenerated.length === 0
      ? {
          id: "generated.files",
          category: "generated",
          severity: "info",
          status: "pass",
          summary: "Generated Syncore files are present.",
          details: "syncore/_generated looks available for runtime and type-driven tooling.",
          canAutoFix: false
        }
      : {
          id: "generated.files",
          category: "generated",
          severity: "error",
          status: "fail",
          summary: "Generated Syncore files are missing.",
          details: `Missing: ${missingGenerated.map((check) => check.path).join(", ")}.`,
          suggestedAction: "Run `npx syncorejs codegen` or `npx syncorejs doctor --fix`.",
          canAutoFix: true,
          fixCommand: "npx syncorejs doctor --fix"
        }
  );

  diagnostics.push(buildSchemaDiagnostic(input.drift));

  diagnostics.push(
    input.projectTarget
      ? {
          id: "persistence.project-target",
          category: "persistence",
          severity: "info",
          status: "pass",
          summary: "Project target persistence is configured.",
          ...(input.persistenceDetails ? { details: input.persistenceDetails } : {}),
          canAutoFix: false
        }
      : input.usesConnectedClients
        ? {
            id: "persistence.project-target",
            category: "persistence",
            severity: "info",
            status: "pass",
            summary: "Persistence is client-managed for this template.",
            details:
              "This app template expects a connected client runtime to provide local storage and runtime state.",
            canAutoFix: false
          }
        : {
            id: "persistence.project-target",
            category: "persistence",
            severity: "error",
            status: "fail",
            summary: "No local project target is configured.",
            details:
              input.persistenceDetails ??
              "Syncore could not resolve a project target database and storage directory.",
            suggestedAction:
              "Check syncore.config.ts and make sure projectTarget.databasePath and projectTarget.storageDirectory are valid.",
            canAutoFix: false
          }
  );

  diagnostics.push(
    input.hub.running
      ? {
          id: "hub.devtools",
          category: "hub",
          severity: "info",
          status: "pass",
          summary: "Local devtools hub is running.",
          details: `Devtools: ${input.hub.url}. Dashboard: ${input.hub.dashboardUrl}.`,
          canAutoFix: false
        }
      : {
          id: "hub.devtools",
          category: "hub",
          severity: "warning",
          status: "warn",
          summary: "Local devtools hub is not running.",
          details: `Expected devtools endpoint: ${input.hub.url}.`,
          suggestedAction: "Run `npx syncorejs dev` to start the local hub and dashboard.",
          canAutoFix: false
        }
  );

  diagnostics.push(
    input.hub.dashboardRunning
      ? {
          id: "hub.dashboard",
          category: "hub",
          severity: "info",
          status: "pass",
          summary: "Dashboard shell is responding.",
          details: input.hub.dashboardUrl,
          canAutoFix: false
        }
      : {
          id: "hub.dashboard",
          category: "hub",
          severity: "warning",
          status: "warn",
          summary: "Dashboard shell is not responding yet.",
          details: `Expected dashboard URL: ${input.hub.dashboardUrl}.`,
          suggestedAction: "Run `npx syncorejs dev` or inspect whether the dashboard port is already taken.",
          canAutoFix: false
        }
  );

  diagnostics.push(
    input.usesConnectedClients
      ? input.clientTargets.length > 0
        ? {
            id: "client.runtime",
            category: "client",
            severity: "info",
            status: "pass",
            summary: "At least one client runtime is connected.",
            details: `Connected targets: ${input.clientTargets.map((target) => target.id).join(", ")}.`,
            canAutoFix: false
          }
        : {
            id: "client.runtime",
            category: "client",
            severity: "warning",
            status: "warn",
            summary: "This template is waiting for a connected client runtime.",
            details:
              "Syncore is ready to inspect or operate on your app once a browser tab, worker, Electron shell, or Expo runtime connects.",
            suggestedAction:
              "Start your app host, then run `npx syncorejs targets` to inspect connected client targets.",
            canAutoFix: false
          }
      : {
          id: "client.runtime",
          category: "client",
          severity: "info",
          status: "pass",
          summary: "This template does not require a connected client runtime.",
          canAutoFix: false
        }
  );

  diagnostics.push(buildRuntimeDiagnostic(input.runtimeSignals));

  return diagnostics;
}

function buildSchemaDiagnostic(drift: DriftState): JourneyDiagnostic {
  if (drift.state === "clean") {
    return {
      id: "schema.drift",
      category: "schema",
      severity: "info",
      status: "pass",
      summary: "Schema snapshot is in sync.",
      ...(drift.details ? { details: drift.details } : {}),
      canAutoFix: false
    };
  }
  if (drift.state === "destructive") {
    return {
      id: "schema.drift",
      category: "schema",
      severity: "error",
      status: "fail",
      summary: "Schema drift includes destructive changes.",
      details: drift.destructiveChanges.join("; "),
      suggestedAction:
        "Review the schema change manually and create or edit a migration before continuing.",
      canAutoFix: false
    };
  }
  if (drift.state === "missing-snapshot") {
    return {
      id: "schema.drift",
      category: "schema",
      severity: "warning",
      status: "warn",
      summary: "No stored schema snapshot was found.",
      ...(drift.details ? { details: drift.details } : {}),
      suggestedAction:
        "Run `npx syncorejs doctor --fix` to refresh the snapshot, or generate a migration if you intend to persist the change.",
      canAutoFix: true,
      fixCommand: "npx syncorejs doctor --fix"
    };
  }
  if (drift.state === "snapshot-outdated" || drift.state === "migration-pending") {
    return {
      id: "schema.drift",
      category: "schema",
      severity: "warning",
      status: "warn",
      summary:
        drift.state === "migration-pending"
          ? "Schema drift has pending migration statements."
          : "Stored schema snapshot differs from the generated schema.",
      ...(drift.details ? { details: drift.details } : {}),
      suggestedAction:
        drift.state === "migration-pending"
          ? "Run `npx syncorejs migrate status` to inspect the diff, then `npx syncorejs doctor --fix` only if you just want to refresh the stored snapshot."
          : "Run `npx syncorejs doctor --fix` to refresh the stored snapshot safely.",
      canAutoFix: true,
      fixCommand: "npx syncorejs doctor --fix"
    };
  }
  return {
    id: "schema.drift",
    category: "schema",
    severity: "warning",
    status: "warn",
    summary: "Schema drift could not be inspected yet.",
    ...(drift.details ? { details: drift.details } : {}),
    suggestedAction:
      "Restore generated files or rerun `npx syncorejs codegen`, then run `npx syncorejs doctor` again.",
    canAutoFix: false
  };
}

function buildRuntimeDiagnostic(runtimeSignals: RuntimeSignals): JourneyDiagnostic {
  if (runtimeSignals.sessionState === "invalid") {
    return {
      id: "runtime.session",
      category: "runtime",
      severity: "warning",
      status: "warn",
      summary: "The saved devtools session file is invalid.",
      details: runtimeSignals.sessionPath,
      suggestedAction:
        "Restart `npx syncorejs dev` to regenerate the session state for the local hub.",
      canAutoFix: false
    };
  }
  if (runtimeSignals.logEntryCount === 0) {
    return {
      id: "runtime.signals",
      category: "runtime",
      severity: "info",
      status: "pass",
      summary: "No recent runtime signals were recorded yet.",
      details: runtimeSignals.logFilePresent
        ? "The runtime log file exists but has no recorded entries yet."
        : "No runtime log file has been created yet.",
      canAutoFix: false
    };
  }
  const latest = runtimeSignals.recent[runtimeSignals.recent.length - 1];
  return {
    id: "runtime.signals",
    category: "runtime",
    severity: "info",
    status: "pass",
    summary: "Recent runtime signals are available.",
    ...(latest
      ? {
          details: `Latest: ${latest.category} on ${latest.targetId} at ${new Date(latest.timestamp).toISOString()}: ${latest.message}`
        }
      : {}),
    canAutoFix: false
  };
}

function resolvePrimaryIssue(input: {
  checks: DoctorCheck[];
  diagnostics: JourneyDiagnostic[];
  drift: DriftState;
  hasProject: boolean;
  hubRunning: boolean;
  usesConnectedClients: boolean;
  clientTargets: ClientTargetDescriptor[];
  workspaceMatches: WorkspaceProjectMatch[];
}): DoctorPrimaryIssue {
  if (!input.hasProject && input.workspaceMatches.length > 0) {
    return {
      code: "workspace-root",
      summary: "You are at a workspace root, not inside a Syncore app package.",
      details: `Found ${input.workspaceMatches.length} Syncore package(s) under this workspace.`,
      impact: "Project-specific diagnostics and runtime operations are ambiguous from the workspace root.",
      suggestedAction: `Run the command with --cwd ${input.workspaceMatches[0]!.relativePath} or change into that package directory.`
    };
  }

  const missingProjectPaths = input.checks.filter(
    (check) => (check.category === "project" || check.category === "schema") && !check.ok
  );
  if (!input.hasProject || missingProjectPaths.length > 0) {
    return {
      code: "missing-project",
      summary: "Syncore project files are missing or incomplete.",
      details:
        missingProjectPaths.length > 0
          ? `Missing: ${missingProjectPaths.map((check) => check.path).join(", ")}.`
          : "This directory does not contain a complete Syncore project yet.",
      impact: "The CLI cannot bootstrap the local runtime or inspect schema and persistence reliably.",
      suggestedAction: "Run `npx syncorejs init` or restore the missing project files."
    };
  }

  const missingGenerated = input.checks.filter(
    (check) => check.category === "generated" && !check.ok
  );
  if (missingGenerated.length > 0) {
    return {
      code: "missing-generated",
      summary: "Generated Syncore files are missing.",
      details: `Missing: ${missingGenerated.map((check) => check.path).join(", ")}.`,
      impact: "Type-driven runtime loading and schema inspection may be stale or unavailable.",
      suggestedAction: "Run `npx syncorejs doctor --fix` or `npx syncorejs codegen`."
    };
  }

  if (input.drift.state === "destructive") {
    return {
      code: "schema-destructive-drift",
      summary: "Schema drift is blocked by destructive changes.",
      details: input.drift.destructiveChanges.join("; "),
      impact: "Syncore cannot safely advance the local schema automatically.",
      suggestedAction: "Review the schema change manually and generate a migration before continuing."
    };
  }

  if (input.usesConnectedClients && input.clientTargets.length === 0) {
    return {
      code: "waiting-for-client",
      summary: "This app is waiting for a connected local runtime.",
      details:
        input.hubRunning
          ? "Client-managed templates only become fully operational after the app host connects to the local Syncore hub."
          : "This template depends on a client-managed runtime, and no app runtime is connected yet.",
      impact: "Worker, bridge IPC, storage, and client-side data inspection stay unavailable until a runtime connects.",
      suggestedAction:
        input.hubRunning
          ? "Start your app host, then run `npx syncorejs targets` to inspect connected runtimes."
          : "Run `npx syncorejs dev`, start your app host, then run `npx syncorejs targets` to inspect connected runtimes."
    };
  }

  if (
    input.drift.state === "missing-snapshot" ||
    input.drift.state === "snapshot-outdated" ||
    input.drift.state === "migration-pending"
  ) {
    return {
      code: "schema-drift",
      summary: "The local schema snapshot is out of sync.",
      details: input.drift.details ?? "Schema drift was detected.",
      impact: "The local dev loop can become confusing because the stored snapshot no longer matches the generated schema.",
      suggestedAction:
        input.drift.state === "migration-pending"
          ? "Run `npx syncorejs migrate status` to inspect the diff, then use `npx syncorejs doctor --fix` if you only need to refresh the stored snapshot."
          : "Run `npx syncorejs doctor --fix` to refresh the stored snapshot safely."
    };
  }

  if (!input.hubRunning) {
    return {
      code: "hub-down",
      summary: "The local devtools hub is not running.",
      details: "Syncore can inspect project state, but runtime and client diagnostics are limited until the hub starts.",
      impact: "Commands that depend on live targets, logs, or IPC visibility will have reduced signal.",
      suggestedAction: "Run `npx syncorejs dev` to start the local hub."
    };
  }

  return {
    code: "ready",
    summary: "Syncore is ready for the local development loop.",
    details: "Project structure, generated files, schema state, and runtime prerequisites look healthy.",
    impact: "You can use `syncorejs dev`, inspect targets, and operate on the local runtime.",
    suggestedAction: "Run `npx syncorejs dev` to keep codegen, schema, and the local hub in sync."
  };
}

function collectSuggestions(
  primaryIssue: DoctorPrimaryIssue,
  diagnostics: JourneyDiagnostic[],
  workspaceMatches: WorkspaceProjectMatch[]
): string[] {
  const suggestions = new Set<string>();
  if (primaryIssue.suggestedAction) {
    suggestions.add(primaryIssue.suggestedAction);
  }
  if (primaryIssue.code === "workspace-root" && workspaceMatches.length > 0) {
    suggestions.add(
      `Run the command with --cwd ${workspaceMatches[0]!.relativePath} or change into a package directory.`
    );
  }
  for (const diagnostic of diagnostics) {
    if (diagnostic.status === "pass") {
      continue;
    }
    if (diagnostic.suggestedAction) {
      suggestions.add(diagnostic.suggestedAction);
    }
  }
  return [...suggestions];
}
