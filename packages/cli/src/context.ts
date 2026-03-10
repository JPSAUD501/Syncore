import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { CliError, type CliErrorCategory, normalizeCliError } from "./errors.js";

export interface GlobalCliOptions {
  cwd?: string;
  json?: boolean;
  verbose?: boolean;
  interactive?: boolean;
  yes?: boolean;
}

export interface CliChoice<TValue> {
  label: string;
  value: TValue;
  description?: string;
}

export interface CliResult<TValue = unknown> {
  command?: string;
  summary?: string;
  target?: string;
  data?: TValue;
  nextSteps?: string[];
}

export class CliContext {
  readonly cwd: string;
  readonly json: boolean;
  readonly verbose: boolean;
  readonly interactive: boolean;
  readonly yes: boolean;

  constructor(options: GlobalCliOptions = {}) {
    this.cwd = path.resolve(options.cwd ?? process.cwd());
    this.json = options.json ?? false;
    this.verbose = options.verbose ?? false;
    this.yes = options.yes ?? false;
    this.interactive =
      options.interactive === false
        ? false
        : process.env.SYNCORE_FORCE_INTERACTIVE === "1"
          ? true
          : Boolean(process.stdin.isTTY && process.stdout.isTTY && !this.json);
  }

  info(message: string): void {
    if (!this.json) {
      process.stdout.write(`[info] ${message}\n`);
    }
  }

  success(message: string): void {
    if (!this.json) {
      process.stdout.write(`[done] ${message}\n`);
    }
  }

  warn(message: string): void {
    if (!this.json) {
      process.stderr.write(`[warn] ${message}\n`);
    }
  }

  error(message: string): void {
    if (!this.json) {
      process.stderr.write(`[error] ${message}\n`);
    }
  }

  nextStep(message: string): void {
    if (!this.json) {
      process.stdout.write(`[next] ${message}\n`);
    }
  }

  printJson(payload: unknown): void {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  }

  printResult<TValue>(result: CliResult<TValue>): void {
    if (this.json) {
      this.printJson({
        ok: true,
        cwd: this.cwd,
        ...(result.command ? { command: result.command } : {}),
        ...(result.target ? { target: result.target } : {}),
        ...(result.summary ? { summary: result.summary } : {}),
        ...(result.data !== undefined ? { data: result.data } : {}),
        ...(result.nextSteps ? { nextSteps: result.nextSteps } : {})
      });
      return;
    }

    if (result.summary) {
      this.success(result.summary);
    }
    if (result.nextSteps) {
      for (const step of result.nextSteps) {
        this.nextStep(step);
      }
    }
  }

  fail(
    message: string,
    exitCode = 1,
    details?: unknown,
    options: {
      category?: CliErrorCategory;
      nextSteps?: string[];
    } = {}
  ): never {
    const errorOptions = {
      exitCode,
      details,
      ...(options.category ? { category: options.category } : {}),
      ...(options.nextSteps ? { nextSteps: options.nextSteps } : {})
    };
    throw new CliError(message, errorOptions);
  }

  handleError(error: unknown): void {
    const cliError = normalizeCliError(error);

    if (this.json) {
      this.printJson({
        ok: false,
        cwd: this.cwd,
        error: {
          category: cliError.category,
          message: cliError.message,
          exitCode: cliError.exitCode,
          ...(cliError.details !== undefined ? { details: cliError.details } : {}),
          ...(cliError.nextSteps ? { nextSteps: cliError.nextSteps } : {})
        }
      });
    } else {
      this.error(cliError.message);
      if (cliError.nextSteps) {
        for (const step of cliError.nextSteps) {
          this.nextStep(step);
        }
      }
      if (this.verbose && cliError.details !== undefined) {
        this.error(JSON.stringify(cliError.details, null, 2));
      }
    }

    process.exitCode = cliError.exitCode;
  }

  async confirm(message: string, defaultValue = true): Promise<boolean> {
    if (this.yes) {
      return true;
    }
    if (!this.interactive) {
      return false;
    }

    const suffix = defaultValue ? "Y/n" : "y/N";
    const answer = await this.input(`${message} [${suffix}]`, {
      defaultValue: defaultValue ? "y" : "n"
    });
    const normalized = answer.trim().toLowerCase();
    if (normalized.length === 0) {
      return defaultValue;
    }
    return normalized === "y" || normalized === "yes";
  }

  async input(
    message: string,
    options: {
      defaultValue?: string;
      allowEmpty?: boolean;
    } = {}
  ): Promise<string> {
    if (!this.interactive) {
      this.fail(`Cannot prompt in non-interactive mode: ${message}`);
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    try {
      const prompt =
        options.defaultValue !== undefined
          ? `${message} (${options.defaultValue}): `
          : `${message}: `;
      const answer = await rl.question(prompt);
      if (answer.length === 0 && options.defaultValue !== undefined) {
        return options.defaultValue;
      }
      if (answer.length === 0 && !options.allowEmpty) {
        this.fail(`A value is required for: ${message}`);
      }
      return answer;
    } finally {
      rl.close();
    }
  }

  async select<TValue>(
    message: string,
    choices: CliChoice<TValue>[],
    defaultValue?: TValue
  ): Promise<TValue> {
    if (!this.interactive) {
      this.fail(`Cannot prompt in non-interactive mode: ${message}`);
    }
    if (choices.length === 0) {
      this.fail(`No choices are available for: ${message}`);
    }

    this.info(message);
    choices.forEach((choice, index) => {
      const suffix = choice.description ? ` - ${choice.description}` : "";
      process.stdout.write(`  ${index + 1}. ${choice.label}${suffix}\n`);
    });

    const defaultIndex = defaultValue
      ? Math.max(
          choices.findIndex((choice) => choice.value === defaultValue),
          0
        )
      : 0;
    const rawValue = await this.input(`Choose 1-${choices.length}`, {
      defaultValue: String(defaultIndex + 1)
    });
    const index = Number.parseInt(rawValue, 10);
    if (Number.isNaN(index) || index < 1 || index > choices.length) {
      this.fail(`Expected a value between 1 and ${choices.length}.`);
    }
    return choices[index - 1]!.value;
  }

  async withSpinner<TValue>(
    label: string,
    action: () => Promise<TValue>
  ): Promise<TValue> {
    if (!this.interactive) {
      this.info(label);
      return await action();
    }

    const frames = ["-", "\\", "|", "/"];
    let index = 0;
    process.stderr.write(`[work] ${label}`);
    const timer = setInterval(() => {
      process.stderr.write(`\r[${frames[index % frames.length]}] ${label}`);
      index += 1;
    }, 80);

    try {
      const result = await action();
      clearInterval(timer);
      process.stderr.write(`\r[done] ${label}\n`);
      return result;
    } catch (error) {
      clearInterval(timer);
      process.stderr.write(`\r[fail] ${label}\n`);
      throw error;
    }
  }
}

export async function openTarget(target: string): Promise<boolean> {
  const command =
    process.platform === "win32"
      ? {
          file: "cmd",
          args: ["/c", "start", "", target]
        }
      : process.platform === "darwin"
        ? {
            file: "open",
            args: [target]
          }
        : {
            file: "xdg-open",
            args: [target]
          };

  return await new Promise((resolve) => {
    const child = spawn(command.file, command.args, {
      detached: true,
      stdio: "ignore"
    });
    child.once("error", () => resolve(false));
    child.once("spawn", () => {
      child.unref();
      resolve(true);
    });
  });
}
