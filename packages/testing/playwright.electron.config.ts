import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: /electron-smoke\.spec\.ts/,
  timeout: 60_000,
  expect: {
    timeout: 10_000
  },
  fullyParallel: false,
  retries: 0,
  use: {
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"]
  }
});
