import { spawn } from "node:child_process";

import type { CliContext } from "./context.js";

type ConsoleMethod = "log" | "warn" | "error";

export async function withConsoleCapture<TValue>(
  onMessage: (method: ConsoleMethod, message: string) => void,
  action: () => Promise<TValue>
): Promise<TValue> {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  const capture =
    (method: ConsoleMethod) =>
    (...args: unknown[]) => {
      const message = args
        .map((value) => (typeof value === "string" ? value : String(value)))
        .join(" ")
        .trim();
      if (message.length > 0) {
        onMessage(method, message);
      }
    };

  console.log = capture("log");
  console.warn = capture("warn");
  console.error = capture("error");

  try {
    return await action();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
}

export function printDevSessionIntro(context: CliContext): void {
  context.info("Starting Syncore local dev session...");
}

export function printCompactDevPhase(context: CliContext, label: string): void {
  context.info(label);
}

export async function runShellCommand(
  context: CliContext,
  command: string
): Promise<void> {
  context.info(`Starting host command after Syncore bootstrap: ${command}`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, {
      cwd: context.cwd,
      shell: true,
      stdio: "inherit"
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if ((code ?? 1) !== 0) {
        reject(new Error(`Shell command failed with exit code ${code ?? 1}.`));
        return;
      }
      resolve();
    });
  });
}

