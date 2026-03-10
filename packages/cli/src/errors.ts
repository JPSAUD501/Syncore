export type CliErrorCategory =
  | "usage"
  | "context"
  | "validation"
  | "target"
  | "hub"
  | "runtime"
  | "system";

export interface CliErrorOptions {
  exitCode?: number;
  category?: CliErrorCategory;
  details?: unknown;
  nextSteps?: string[];
}

export class CliError extends Error {
  readonly exitCode: number;
  readonly category: CliErrorCategory;
  readonly details: unknown;
  readonly nextSteps: string[] | undefined;

  constructor(message: string, options: CliErrorOptions = {}) {
    super(message);
    this.exitCode = options.exitCode ?? 1;
    this.category = options.category ?? "system";
    this.details = options.details;
    this.nextSteps = options.nextSteps;
  }
}

export function normalizeCliError(error: unknown): CliError {
  if (error instanceof CliError) {
    return error;
  }

  return new CliError(error instanceof Error ? error.message : String(error));
}
