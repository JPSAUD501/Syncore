import {
  type SyncoreTemplateName,
  templateUsesConnectedClients as coreTemplateUsesConnectedClients
} from "@syncore/core/cli";

export function buildInitNextSteps(template: SyncoreTemplateName): string[] {
  if (templateUsesConnectedClients(template)) {
    return [
      "Run `npx syncorejs dev` to start the hub and keep generated code in sync.",
      "After your app connects, run `npx syncorejs targets` to inspect connected client targets."
    ];
  }

  return [
    "Run `npx syncorejs dev` to start the local loop.",
    "Operational commands default to `project` when it is the only target."
  ];
}

export function buildDevBootstrapNextSteps(): string[] {
  return [
    "Run `npx syncorejs dashboard --open` to inspect the dashboard.",
    "Run `npx syncorejs targets` to inspect available targets.",
    "Run `npx syncorejs doctor` to inspect project health."
  ];
}

export function buildTargetCommandNextSteps(targetId?: string): string[] {
  if (targetId) {
    return [`Use \`npx syncorejs run --target ${targetId} <function>\` to operate on a specific target.`];
  }
  return [
    "Run `npx syncorejs dev` and connect an app runtime, or define a projectTarget for Node/Electron projects."
  ];
}

export function buildSelectTargetNextSteps(): string[] {
  return [
    "Run `npx syncorejs targets` to inspect the available targets.",
    "Rerun the command with `--target <id>` to choose one explicitly."
  ];
}

export function buildHubUnavailableNextSteps(): string[] {
  return [
    "Run `npx syncorejs dev` to start the local devtools hub.",
    "Then rerun `npx syncorejs targets` to confirm the available targets."
  ];
}

export function buildNoTargetsNextSteps(): string[] {
  return [
    "Run `npx syncorejs dev` to start the local hub.",
    "Then run `npx syncorejs targets` to inspect the available targets."
  ];
}

export function templateUsesConnectedClients(template: string): boolean {
  return coreTemplateUsesConnectedClients(template as SyncoreTemplateName);
}
