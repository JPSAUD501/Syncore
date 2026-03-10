import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const packageRoot = import.meta.dirname;
const workspaceRoot = path.resolve(packageRoot, "../..");
const exampleRoot = path.join(workspaceRoot, "examples", "next-pwa");
const staticServerScript = path.join(packageRoot, "src", "static-server.ts");

export default defineConfig({
  testDir: "./tests",
  testMatch: /next-offline\.spec\.ts/,
  timeout: 60_000,
  expect: {
    timeout: 10_000
  },
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:3210",
    trace: "retain-on-failure"
  },
  webServer: {
    command: [
      "bun run turbo run build --filter=syncore-example-next-pwa",
      `bun run tsx "${staticServerScript}" "${path.join(exampleRoot, "out")}" 3210`
    ].join(" && "),
    cwd: workspaceRoot,
    port: 3210,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"]
      }
    }
  ]
});
