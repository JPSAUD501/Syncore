import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const workspaceRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const androidPackageId = "dev.syncore.expoexample";
const smokeDeepLink = "syncore-expo-example://smoke";
const smokeTimeoutMs = 4 * 60 * 1000;

type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

type AndroidDevice = {
  serial: string;
  isEmulator: boolean;
};

type EnsuredAndroidDevice =
  | {
      kind: "skip";
      reason: string;
    }
  | {
      kind: "ready";
      device: AndroidDevice;
      startedEmulator: boolean;
    };

void main();

async function main(): Promise<void> {
  let emulatorToStop: AndroidDevice | null = null;

  try {
    const deviceState = await ensureAndroidDevice();
    if (deviceState.kind === "skip") {
      logSkip(deviceState.reason);
      process.exit(0);
    }

    if (deviceState.startedEmulator) {
      emulatorToStop = deviceState.device;
    }

    await runStreaming(
      "bun",
      ["run", "turbo", "run", "build", "--filter=syncore-example-expo..."],
      workspaceRoot
    );
    await runStreaming(
      "bun",
      ["run", "--filter", "syncore-example-expo", "android:smoke"],
      workspaceRoot
    );

    await prepareDevice(deviceState.device.serial);
    await clearAppData(deviceState.device.serial);
    await launchSmokeHarness(deviceState.device.serial);
    const status = await waitForSmokeOutcome(
      deviceState.device.serial,
      smokeTimeoutMs
    );

    if (status === "pass") {
      process.stdout.write("Syncore Expo smoke passed.\n");
      process.exit(0);
    }

    throw new Error("The Expo smoke harness reported SYNCORE_EXPO_SMOKE_FAIL.");
  } catch (error) {
    process.stderr.write(`${formatError(error)}\n`);
    process.exitCode = 1;
  } finally {
    if (emulatorToStop) {
      await stopEmulator(emulatorToStop.serial).catch(() => undefined);
    }
  }
}

async function ensureAndroidDevice(): Promise<EnsuredAndroidDevice> {
  if (!(await isCommandAvailable("adb", ["version"]))) {
    return {
      kind: "skip",
      reason: "adb was not found in PATH."
    };
  }

  const connectedDevices = await listAndroidDevices();
  const [firstConnectedDevice] = connectedDevices;
  if (firstConnectedDevice) {
    return {
      kind: "ready",
      device: firstConnectedDevice,
      startedEmulator: false
    };
  }

  if (!(await isCommandAvailable("emulator", ["-list-avds"]))) {
    return {
      kind: "skip",
      reason:
        "No Android device is connected and the emulator command is unavailable."
    };
  }

  const avds = await listAvailableAvds();
  if (avds.length === 0) {
    return {
      kind: "skip",
      reason: "No Android device is connected and no AVD is available to start."
    };
  }

  const [avdName] = avds;
  if (!avdName) {
    return {
      kind: "skip",
      reason:
        "No Android device is connected and no valid AVD name was resolved."
    };
  }
  process.stdout.write(
    `Starting Android emulator "${avdName}" for Syncore smoke...\n`
  );
  const emulatorProcess = spawn(
    "emulator",
    ["-avd", avdName, "-no-snapshot-save", "-no-boot-anim"],
    {
      cwd: workspaceRoot,
      detached: true,
      stdio: "ignore",
      shell: isWindows()
    }
  );
  emulatorProcess.unref();

  const device = await waitForBootedDevice();
  return {
    kind: "ready",
    device,
    startedEmulator: true
  };
}

async function waitForBootedDevice(): Promise<AndroidDevice> {
  const deadline = Date.now() + 3 * 60 * 1000;

  while (Date.now() < deadline) {
    const devices = await listAndroidDevices();
    const bootedDevice =
      devices.find((device) => device.isEmulator) ?? devices[0];
    if (bootedDevice) {
      const bootState = (
        await runCapture("adb", [
          "-s",
          bootedDevice.serial,
          "shell",
          "getprop",
          "sys.boot_completed"
        ])
      ).stdout.trim();
      if (bootState === "1") {
        await prepareDevice(bootedDevice.serial);
        return bootedDevice;
      }
    }

    await wait(2_000);
  }

  throw new Error(
    "Timed out waiting for the Android emulator/device to finish booting."
  );
}

async function listAvailableAvds(): Promise<string[]> {
  const result = await runCapture("emulator", ["-list-avds"]);
  if (result.code !== 0) {
    throw new Error(
      `Unable to list Android AVDs.\n${result.stderr || result.stdout}`
    );
  }
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function listAndroidDevices(): Promise<AndroidDevice[]> {
  const result = await runCapture("adb", ["devices"]);
  if (result.code !== 0) {
    throw new Error(
      `Unable to list Android devices.\n${result.stderr || result.stdout}`
    );
  }

  return result.stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/))
    .filter((parts) => parts[1] === "device")
    .map(([serial]) => serial)
    .filter((serial): serial is string => Boolean(serial))
    .map((serial) => ({
      serial,
      isEmulator: serial.startsWith("emulator-")
    }));
}

async function prepareDevice(serial: string): Promise<void> {
  await runCapture("adb", [
    "-s",
    serial,
    "shell",
    "input",
    "keyevent",
    "KEYCODE_WAKEUP"
  ]);
  await runCapture("adb", ["-s", serial, "shell", "wm", "dismiss-keyguard"]);
  await runCapture("adb", ["-s", serial, "shell", "input", "keyevent", "82"]);
}

async function clearAppData(serial: string): Promise<void> {
  await runCapture("adb", [
    "-s",
    serial,
    "shell",
    "am",
    "force-stop",
    androidPackageId
  ]);
  const result = await runCapture("adb", [
    "-s",
    serial,
    "shell",
    "pm",
    "clear",
    androidPackageId
  ]);
  const output = `${result.stdout}\n${result.stderr}`;
  if (!output.includes("Success")) {
    throw new Error(`Unable to clear Expo example app data.\n${output}`);
  }
}

async function launchSmokeHarness(serial: string): Promise<void> {
  const result = await runCapture("adb", [
    "-s",
    serial,
    "shell",
    "am",
    "start",
    "-W",
    "-a",
    "android.intent.action.VIEW",
    "-d",
    smokeDeepLink,
    androidPackageId
  ]);
  if (result.code !== 0) {
    throw new Error(
      `Unable to launch the Expo smoke deep link.\n${result.stderr || result.stdout}`
    );
  }
}

async function waitForSmokeOutcome(
  serial: string,
  timeoutMs: number
): Promise<"pass" | "fail"> {
  const deadline = Date.now() + timeoutMs;
  let lastDump = "";

  while (Date.now() < deadline) {
    lastDump = await dumpUiHierarchy(serial);

    if (lastDump.includes("SYNCORE_EXPO_SMOKE_PASS")) {
      return "pass";
    }
    if (lastDump.includes("SYNCORE_EXPO_SMOKE_FAIL")) {
      return "fail";
    }

    await wait(2_000);
  }

  throw new Error(
    `Timed out waiting for the Expo smoke harness to finish.\nLast UI dump:\n${truncate(lastDump, 2_000)}`
  );
}

async function dumpUiHierarchy(serial: string): Promise<string> {
  const remotePath = "/data/local/tmp/syncore-expo-smoke.xml";
  await runCapture("adb", [
    "-s",
    serial,
    "shell",
    "uiautomator",
    "dump",
    remotePath
  ]);
  const dump = await runCapture("adb", [
    "-s",
    serial,
    "shell",
    "cat",
    remotePath
  ]);
  return `${dump.stdout}\n${dump.stderr}`;
}

async function stopEmulator(serial: string): Promise<void> {
  await runCapture("adb", ["-s", serial, "emu", "kill"]);
}

async function isCommandAvailable(
  command: string,
  args: string[]
): Promise<boolean> {
  const result = await runCapture(command, args, { allowSpawnFailure: true });
  return result.code === 0;
}

async function runStreaming(
  command: string,
  args: string[],
  cwd: string
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: "inherit",
      shell: isWindows()
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `Command failed: ${command} ${args.join(" ")} (exit ${code ?? "unknown"})`
        )
      );
    });
  });
}

async function runCapture(
  command: string,
  args: string[],
  options?: {
    allowSpawnFailure?: boolean;
  }
): Promise<CommandResult> {
  return new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: workspaceRoot,
      env: process.env,
      shell: isWindows()
    });
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      if (options?.allowSpawnFailure && isSpawnError(error)) {
        resolve({
          code: 1,
          stdout,
          stderr: error.message
        });
        return;
      }
      reject(error);
    });

    child.on("exit", (code) => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr
      });
    });
  });
}

function isSpawnError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}

function logSkip(reason: string): void {
  process.stdout.write(`Skipping Syncore Expo smoke: ${reason}\n`);
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}...`;
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function isWindows(): boolean {
  return os.platform() === "win32";
}
