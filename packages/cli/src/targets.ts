import type { CliContext } from "./context.js";
import { listAvailableTargets, targetSupportsCapability, type SyncoreTargetDescriptor, type TargetCapability } from "./project.js";
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
