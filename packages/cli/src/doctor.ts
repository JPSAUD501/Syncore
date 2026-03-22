import path from "node:path";
import { detectProjectTemplate, fileExists, isLocalPortInUse } from "@syncore/core/cli";
import type { ClientTargetDescriptor, SyncoreTargetDescriptor, WorkspaceProjectMatch } from "./project.js";
import {
  findWorkspaceSyncoreProjects,
  listAvailableTargets,
  resolveDashboardUrl,
  resolveDevtoolsUrl,
  resolveProjectTargetDescriptor
} from "./project.js";
import { templateUsesConnectedClients } from "./messages.js";

export type DoctorStatus =
  | "ready"
  | "incomplete"
  | "workspace-root"
  | "missing"
  | "waiting-for-client";

export type DoctorCheckCategory = "project" | "generated" | "schema";

export interface DoctorCheck {
  category: DoctorCheckCategory;
  path: string;
  ok: boolean;
}

export interface DoctorReport {
  cwd: string;
  template: string;
  status: DoctorStatus;
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

export async function buildDoctorReport(cwd: string): Promise<DoctorReport> {
  const template = await detectProjectTemplate(cwd);
  const checks = [
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
    { category: "schema" as const, path: path.join("syncore", "migrations") }
  ];
  const checkResults = await Promise.all(
    checks.map(async (entry) => ({
      category: entry.category,
      path: entry.path.replaceAll("\\", "/"),
      ok:
        (await fileExists(path.join(cwd, entry.path))) || entry.optional === true
    }))
  );
  const projectTarget = await resolveProjectTargetDescriptor(cwd);
  const targets = await listAvailableTargets(cwd);
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

  const ready = checkResults.every((entry) => entry.ok);
  const workspaceMatches = ready ? [] : await findWorkspaceSyncoreProjects(cwd);
  const clientTargets = targets.filter(
    (target): target is ClientTargetDescriptor => target.kind === "client"
  );
  const status =
    ready
      ? !projectTarget && clientTargets.length === 0
        ? "waiting-for-client"
        : "ready"
      : workspaceMatches.length > 0
        ? "workspace-root"
        : checkResults.some((entry) => entry.ok)
          ? "incomplete"
          : "missing";

  const suggestions: string[] = [];
  if (status === "workspace-root") {
    suggestions.push(
      `Run the command with --cwd ${workspaceMatches[0]!.relativePath} or change into a package directory.`
    );
  }
  if (status === "missing") {
    suggestions.push("Run `npx syncorejs init` to scaffold a new Syncore project.");
  }
  if (status === "incomplete") {
    suggestions.push("Run `npx syncorejs codegen` after restoring missing files.");
    suggestions.push("Run `npx syncorejs migrate status` to inspect schema state.");
  }
  if (!projectTarget && templateUsesConnectedClients(template)) {
    suggestions.push(
      "Use `npx syncorejs dev` and a connected client target for run/data/import/export in this template."
    );
  }
  if (status === "waiting-for-client") {
    suggestions.push("Start your app host, then run `npx syncorejs targets` to inspect connected client targets.");
  }
  if (!hub.running) {
    suggestions.push("Run `npx syncorejs dev` to start the local devtools hub.");
  }

  return {
    cwd,
    template,
    status,
    checks: checkResults,
    workspaceMatches,
    suggestions,
    projectTarget,
    targets,
    hub
  };
}
