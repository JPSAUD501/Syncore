import type { CliContext } from "./context.js";
import type { DoctorReport } from "./doctor.js";
import type {
  ClientTargetDescriptor,
  SyncoreTargetDescriptor
} from "./project.js";
import { templateUsesConnectedClients } from "./messages.js";

export type JsonLikeFormat = "pretty" | "json" | "jsonl";

export interface PersistedLogEntry {
  version?: 2;
  timestamp: number;
  runtimeId: string;
  targetId: string;
  targetLabel?: string;
  publicRuntimeId?: string;
  runtimeLabel?: string;
  origin?: "runtime" | "dashboard";
  platform?: string;
  eventType: string;
  category: "query" | "mutation" | "action" | "system";
  owner?: "root" | "component";
  componentPath?: string;
  componentName?: string;
  message: string;
  event: Record<string, unknown>;
}

export function formatPersistedLogEntry(entry: PersistedLogEntry): string {
  return formatLogEntry(entry);
}

export function renderOutput(
  context: CliContext,
  value: unknown,
  format: JsonLikeFormat
): void {
  if (format === "json") {
    context.printJson(value);
    return;
  }
  if (format === "jsonl") {
    if (Array.isArray(value)) {
      for (const entry of value) {
        process.stdout.write(`${JSON.stringify(entry)}\n`);
      }
      return;
    }
    process.stdout.write(`${JSON.stringify(value)}\n`);
    return;
  }

  if (Array.isArray(value) && value.every((entry) => isPersistedLogEntry(entry))) {
    for (const entry of value) {
      process.stdout.write(`${formatLogEntry(entry)}\n`);
    }
    return;
  }
  if (isPersistedLogEntry(value)) {
    process.stdout.write(`${formatLogEntry(value)}\n`);
    return;
  }
  if (typeof value === "string") {
    process.stdout.write(`${value}\n`);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      process.stdout.write("[]\n");
      return;
    }
    for (const [index, entry] of value.entries()) {
      process.stdout.write(`${JSON.stringify(entry, null, 2)}\n`);
      if (index < value.length - 1) {
        process.stdout.write("\n");
      }
    }
    return;
  }
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function printTargetsTable(
  targets: SyncoreTargetDescriptor[],
  options: {
    verbose?: boolean;
  } = {}
): void {
  if (targets.length === 0) {
    process.stdout.write("  No targets available.\n");
    return;
  }
  process.stdout.write("  project:\n");
  const projectTargets = targets.filter((target) => target.kind === "project");
  if (projectTargets.length === 0) {
    process.stdout.write("    none\n");
  }
  for (const target of projectTargets) {
    process.stdout.write(
      `    ${target.id}  ${target.label}  online  ${target.capabilities.join(", ")}\n`
    );
    process.stdout.write(`      db: ${target.databasePath}\n`);
    process.stdout.write(`      storage: ${target.storageDirectory}\n`);
  }
  process.stdout.write("  clients:\n");
  const clientTargets = targets.filter((target) => target.kind === "client");
  if (clientTargets.length === 0) {
    process.stdout.write("    none\n");
    return;
  }
  for (const target of clientTargets) {
    process.stdout.write(
      `    ${target.id}  ${target.label}  ${target.platform}  ${target.connectedSessions} session(s)\n`
    );
    process.stdout.write(
      `      origin: ${target.origin ?? "unknown"}  storage: ${target.storageProtocol ?? "unknown"}  capabilities: ${target.capabilities.join(", ")}\n`
    );
    for (const runtime of target.runtimes) {
      process.stdout.write(
        `      runtime ${runtime.id}  ${runtime.label}${runtime.primary ? "  primary" : ""}\n`
      );
      process.stdout.write(
        `        origin: ${runtime.origin ?? "unknown"}  platform: ${runtime.platform}  status: online\n`
      );
    }
    if (options.verbose) {
      process.stdout.write(
        `      runtimeIds: ${target.runtimeIds.join(", ")}\n`
      );
      for (const runtime of target.runtimes) {
        if (runtime.appName || runtime.sessionLabel || runtime.storageIdentity) {
          process.stdout.write(
            `        app: ${runtime.appName ?? "unknown"}  session: ${runtime.sessionLabel ?? "unknown"}  storageIdentity: ${runtime.storageIdentity ?? "unknown"}\n`
          );
        }
      }
      process.stdout.write(
        `      sessions: ${target.sessionLabels.join(", ") || "unknown"}\n`
      );
      process.stdout.write(
        `      storageIdentity: ${target.storageIdentity ?? "unknown"}  database: ${target.databaseLabel ?? "unknown"}\n`
      );
    }
  }
}

export function printDoctorReport(
  report: DoctorReport,
  options: {
    verbose?: boolean;
  } = {}
): void {
  if (report.cwd) {
    process.stdout.write(`  cwd: ${report.cwd}\n`);
  }
  if (report.template) {
    process.stdout.write(`  template: ${report.template}\n`);
  }
  if (report.status) {
    process.stdout.write(`  status: ${report.status}\n`);
  }
  process.stdout.write("  issue:\n");
  process.stdout.write(`    ${report.primaryIssue.summary}\n`);
  process.stdout.write(`    details: ${report.primaryIssue.details}\n`);
  process.stdout.write(`    impact: ${report.primaryIssue.impact}\n`);
  if (report.primaryIssue.suggestedAction) {
    process.stdout.write(`    action: ${report.primaryIssue.suggestedAction}\n`);
  }

  process.stdout.write("  diagnostics:\n");
  for (const diagnostic of sortDiagnostics(report.diagnostics)) {
    process.stdout.write(
      `    ${diagnostic.status.toUpperCase()} ${diagnostic.category} ${diagnostic.summary}\n`
    );
    if (diagnostic.details) {
      process.stdout.write(`      ${diagnostic.details}\n`);
    }
    if (diagnostic.suggestedAction) {
      process.stdout.write(`      next: ${diagnostic.suggestedAction}\n`);
    }
    if (diagnostic.canAutoFix && diagnostic.fixCommand) {
      process.stdout.write(`      autofix: ${diagnostic.fixCommand}\n`);
    }
  }

  process.stdout.write("  files:\n");
  for (const category of ["project", "generated", "schema"] as const) {
    process.stdout.write(`    ${category}:\n`);
    for (const check of report.checks.filter((entry) => entry.category === category)) {
      process.stdout.write(`      ${check.ok ? "OK" : "MISSING"} ${check.path}\n`);
    }
  }

  process.stdout.write("  hub:\n");
  process.stdout.write(`    ${report.hub.running ? "OK" : "MISSING"} ${report.hub.url}\n`);
  if (options.verbose) {
    if (report.hub.dashboardUrl) {
      process.stdout.write(
        `    ${report.hub.dashboardRunning ? "OK" : "MISSING"} ${report.hub.dashboardUrl}\n`
      );
    }
    if (report.hub.ports) {
      process.stdout.write(
        `    ports: dashboard=${report.hub.ports.dashboard} devtools=${report.hub.ports.devtools}\n`
      );
    }
  }

  process.stdout.write("  drift:\n");
  process.stdout.write(`    state: ${report.drift.state}\n`);
  process.stdout.write(
    `    current: ${report.drift.currentSchemaHash ?? "unavailable"}  stored: ${report.drift.storedSchemaHash ?? "none"}\n`
  );
  if (report.drift.details) {
    process.stdout.write(`    ${report.drift.details}\n`);
  }
  if (report.drift.destructiveChanges.length > 0) {
    process.stdout.write(`    destructive: ${report.drift.destructiveChanges.join("; ")}\n`);
  }
  if (report.projectTarget) {
    process.stdout.write("  project target:\n");
    process.stdout.write(`    db: ${report.projectTarget.databasePath}\n`);
    process.stdout.write(`    storage: ${report.projectTarget.storageDirectory}\n`);
  } else if (options.verbose) {
    process.stdout.write("  project target:\n");
    process.stdout.write("    none\n");
  }

  process.stdout.write("  targets:\n");
  if (report.targets.length === 0) {
    process.stdout.write("    none\n");
    return;
  }
  for (const target of report.targets) {
    process.stdout.write(
      `    ${target.id} (${target.kind}) ${target.label} [${target.capabilities.join(", ")}]\n`
    );
    if (options.verbose && target.kind === "client") {
      process.stdout.write(
        `      platform=${target.platform} origin=${target.origin ?? "unknown"} storage=${target.storageProtocol ?? "unknown"} sessions=${target.connectedSessions}\n`
      );
      process.stdout.write(
        `      runtimeIds=${target.runtimeIds.join(", ")}\n`
      );
      for (const runtime of target.runtimes) {
        process.stdout.write(
          `      runtime ${runtime.id} label=${runtime.label} origin=${runtime.origin ?? "unknown"} platform=${runtime.platform} status=online${runtime.primary ? " primary=true" : ""}\n`
        );
      }
    }
  }

  if (report.runtimeSignals.recent.length > 0 && (options.verbose || report.status !== "ready")) {
    process.stdout.write("  runtime signals:\n");
    for (const signal of report.runtimeSignals.recent) {
      process.stdout.write(
        `    ${new Date(signal.timestamp).toISOString()}  ${signal.category}  ${signal.targetId}  ${signal.message}\n`
      );
    }
  }
}

export function printDevReadySummary(
  context: CliContext,
  options: {
    template: string;
    projectTargetConfigured: boolean;
    dashboardUrl: string;
    devtoolsUrl: string;
    targets: SyncoreTargetDescriptor[];
    codegenStatus?: string;
    driftStatus?: string;
    typecheckStatus?: string;
  }
): void {
  const projectTarget = options.targets.find((target) => target.kind === "project");
  const clientTargets = options.targets.filter(
    (target): target is ClientTargetDescriptor => target.kind === "client"
  );

  process.stdout.write("\nReady:\n");
  process.stdout.write(`  template: ${options.template}\n`);
  process.stdout.write(
    `  projectTarget: ${describeProjectTargetState(options.template, options.projectTargetConfigured)}\n`
  );
  if (options.codegenStatus) {
    process.stdout.write(`  codegen: ${options.codegenStatus}\n`);
  }
  if (options.driftStatus) {
    process.stdout.write(`  drift: ${options.driftStatus}\n`);
  }
  if (options.typecheckStatus) {
    process.stdout.write(`  typecheck: ${options.typecheckStatus}\n`);
  }
  process.stdout.write(`  dashboard: ${options.dashboardUrl}\n`);
  process.stdout.write(`  devtools: ${options.devtoolsUrl}\n`);
  if (projectTarget && options.targets.length === 1) {
    process.stdout.write("  default target: project\n");
  } else if (clientTargets.length > 0) {
    process.stdout.write(`  targets: ${clientTargets.map((target) => target.id).join(", ")}\n`);
  } else {
    process.stdout.write("  targets: waiting for client\n");
  }

  context.nextStep("Run `npx syncorejs targets` for detailed target inspection.");
}

function describeProjectTargetState(
  template: string,
  projectTargetConfigured: boolean
): string {
  if (projectTargetConfigured) {
    return "configured";
  }
  return templateUsesConnectedClients(template)
    ? "client-managed"
    : "not configured";
}

function isPersistedLogEntry(value: unknown): value is PersistedLogEntry {
  return Boolean(
    value &&
      typeof value === "object" &&
      "eventType" in value &&
      "category" in value &&
      "message" in value
  );
}

function formatLogEntry(entry: PersistedLogEntry): string {
  const timestamp = new Date(entry.timestamp).toISOString().slice(11, 19);
  const target = entry.targetId ?? "all";
  const runtime =
    entry.origin === "dashboard"
      ? "dashboard"
      : entry.publicRuntimeId && entry.runtimeLabel
      ? `${entry.publicRuntimeId} ${entry.runtimeLabel}`
      : entry.publicRuntimeId ?? entry.runtimeLabel ?? "runtime";
  const component =
    entry.owner === "component" && entry.componentPath
      ? `  component:${entry.componentPath}`
      : "";
  return `${timestamp}  ${target}  ${runtime}${component}  ${entry.category}  ${entry.message}`;
}

function sortDiagnostics(
  diagnostics: DoctorReport["diagnostics"]
): DoctorReport["diagnostics"] {
  const order: Record<"fail" | "warn" | "pass", number> = {
    fail: 0,
    warn: 1,
    pass: 2
  };
  return [...diagnostics].sort((left, right) => {
    const statusDiff = order[left.status] - order[right.status];
    if (statusDiff !== 0) {
      return statusDiff;
    }
    return left.id.localeCompare(right.id);
  });
}
