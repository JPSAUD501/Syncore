import type { CliContext } from "./context.js";
import {
  listAvailableTargets,
  targetSupportsCapability,
  type ClientRuntimeDescriptor,
  type SyncoreTargetDescriptor,
  type TargetCapability
} from "./project.js";
import { CliError } from "./errors.js";
import { buildNoTargetsNextSteps, buildSelectTargetNextSteps } from "./messages.js";

export interface ResolveOperationalTargetOptions {
  command: "run" | "data" | "import" | "export" | "logs";
  capability: TargetCapability;
}

export async function resolveOperationalTarget(
  context: CliContext,
  requestedTarget: string | undefined,
  options: ResolveOperationalTargetOptions
): Promise<SyncoreTargetDescriptor> {
  const allTargets = await listAvailableTargets(context.cwd);
  const targets = allTargets.filter((target) =>
    targetSupportsCapability(target, options.capability)
  );
  if (targets.length === 0) {
    throw new CliError(
      `No Syncore targets are available for \`${options.command}\`.`,
      {
        category: "target",
        nextSteps: buildNoTargetsNextSteps(),
        details: {
          command: options.command,
          capability: options.capability
        }
      }
    );
  }

  if (requestedTarget) {
    if (requestedTarget !== "project" && !/^\d{5}$/.test(requestedTarget)) {
      throw new CliError(
        `Invalid target ${JSON.stringify(requestedTarget)} for \`${options.command}\`.`,
        {
          category: "target",
          nextSteps: buildSelectTargetNextSteps(),
          details: {
            requestedTarget,
            expected: "project or a 5-digit target id"
          }
        }
      );
    }
    const matchedTarget = targets.find((target) => target.id === requestedTarget);
    if (!matchedTarget) {
      throw new CliError(
        `Unknown target ${JSON.stringify(requestedTarget)} for \`${options.command}\`.`,
        {
          category: "target",
          nextSteps: buildSelectTargetNextSteps(),
          details: {
            requestedTarget,
            availableTargets: targets.map((target) => target.id)
          }
        }
      );
    }
    return matchedTarget;
  }

  if (targets.length === 1) {
    context.info(`Using target ${targets[0]!.id} automatically.`);
    return targets[0]!;
  }

  if (!context.interactive) {
    throw new CliError(
      `Multiple Syncore targets are available for \`${options.command}\`.`,
      {
        category: "target",
        nextSteps: buildSelectTargetNextSteps(),
        details: {
          availableTargets: targets.map((target) => target.id)
        }
      }
    );
  }

  return await context.select(
    "Choose a Syncore target.",
    targets.map((target) => ({
      label: `${target.id} - ${target.label}`,
      value: target,
      description:
        target.kind === "project"
          ? target.databasePath
          : `${target.platform}, ${target.connectedSessions} session(s), ${target.capabilities.join("/")}`
    }))
  );
}

export function resolveClientRuntime(
  target: SyncoreTargetDescriptor,
  requestedRuntime: string | undefined,
  options: {
    command: "run" | "data" | "import" | "export" | "logs";
  }
): ClientRuntimeDescriptor | null {
  if (!requestedRuntime) {
    return target.kind === "client"
      ? target.runtimes.find((runtime) => runtime.primary) ?? target.runtimes[0] ?? null
      : null;
  }

  if (target.kind === "project") {
    throw new CliError(
      `\`${options.command}\` does not accept --runtime for the project target.`,
      {
        category: "target",
        nextSteps: buildSelectTargetNextSteps(),
        details: {
          targetId: target.id,
          requestedRuntime
        }
      }
    );
  }

  if (!/^\d{5}$/.test(requestedRuntime)) {
    throw new CliError(
      `Invalid runtime ${JSON.stringify(requestedRuntime)} for \`${options.command}\`.`,
      {
        category: "target",
        nextSteps: buildSelectTargetNextSteps(),
        details: {
          targetId: target.id,
          requestedRuntime,
          expected: "a 5-digit runtime id"
        }
      }
    );
  }

  const runtime = target.runtimes.find((entry) => entry.id === requestedRuntime);
  if (!runtime) {
    throw new CliError(
      `Unknown runtime ${JSON.stringify(requestedRuntime)} for target ${JSON.stringify(target.id)}.`,
      {
        category: "target",
        nextSteps: buildSelectTargetNextSteps(),
        details: {
          targetId: target.id,
          requestedRuntime,
          availableRuntimes: target.runtimes.map((entry) => ({
            id: entry.id,
            label: entry.label
          }))
        }
      }
    );
  }

  return runtime;
}
