import { vendorSyncoreInternals } from "./syncore-packaging";

async function main(): Promise<void> {
  await vendorSyncoreInternals();
}

void main();
