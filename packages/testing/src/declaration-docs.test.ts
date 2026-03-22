import { describe, it } from "vitest";
import {
  expectPublicDeclarationsToBeDocumented,
  readDeclarationFile
} from "./declaration-docs";

describe("published declaration docs", () => {
  it("covers core runtime public symbols", async () => {
    const runtimeDeclarations = await readDeclarationFile(
      "../../core/dist/runtime/runtime.d.mts"
    );
    const functionDeclarations = await readDeclarationFile(
      "../../core/dist/runtime/functions.d.mts"
    );

    expectPublicDeclarationsToBeDocumented(functionDeclarations, [
      { symbol: "FunctionReference", kind: "interface" },
      { symbol: "query", kind: "function" },
      { symbol: "mutation", kind: "function" },
      { symbol: "action", kind: "function" },
      { symbol: "cronJobs", kind: "function" }
    ]);

    expectPublicDeclarationsToBeDocumented(runtimeDeclarations, [
      { symbol: "StorageWriteInput", kind: "interface" },
      { symbol: "StorageObject", kind: "interface" },
      { symbol: "SyncoreStorageApi", kind: "interface" },
      { symbol: "QueryCtx", kind: "interface" },
      { symbol: "MutationCtx", kind: "interface" },
      { symbol: "ActionCtx", kind: "interface" },
      { symbol: "SyncoreClient", kind: "interface" },
      { symbol: "QueryBuilder", kind: "interface" },
      { symbol: "SyncoreRuntime", kind: "class" },
      { symbol: "createFunctionReferenceFor", kind: "function" }
    ]);
  });

  it("covers schema public symbols", async () => {
    const declarations = await readDeclarationFile(
      "../../schema/dist/validators.d.ts"
    );

    expectPublicDeclarationsToBeDocumented(declarations, [
      { symbol: "Validator", kind: "interface" },
      { symbol: "ValidatorBuilderApi", kind: "interface" },
      { symbol: "s", kind: "const" }
    ]);
  });

  it("covers react public symbols", async () => {
    const declarations = await readDeclarationFile(
      "../../react/dist/index.d.ts"
    );

    expectPublicDeclarationsToBeDocumented(declarations, [
      { symbol: "SyncoreProvider", kind: "function" },
      { symbol: "useSyncore", kind: "function" },
      { symbol: "useQuery", kind: "function" },
      { symbol: "useMutation", kind: "function" },
      { symbol: "useAction", kind: "function" },
      { symbol: "useQueries", kind: "function" }
    ]);
  });

  it("covers svelte public symbols", async () => {
    const declarations = await readDeclarationFile(
      "../../svelte/dist/index.d.ts"
    );

    expectPublicDeclarationsToBeDocumented(declarations, [
      { symbol: "SyncoreQueryStoreState", kind: "interface" },
      { symbol: "setSyncoreClient", kind: "function" },
      { symbol: "getSyncoreClient", kind: "function" },
      { symbol: "createQueryStore", kind: "function" },
      { symbol: "createClientQueryStore", kind: "function" },
      { symbol: "createMutation", kind: "function" },
      { symbol: "createAction", kind: "function" }
    ]);
  });

  it("covers web adapter public symbols", async () => {
    const declarations = await readDeclarationFile(
      "../../platform-web/dist/index.d.ts"
    );
    const workerDeclarations = await readDeclarationFile(
      "../../platform-web/dist/worker.d.ts"
    );
    const reactDeclarations = await readDeclarationFile(
      "../../platform-web/dist/react.d.ts"
    );

    expectPublicDeclarationsToBeDocumented(declarations, [
      { symbol: "CreateWebRuntimeOptions", kind: "interface" },
      { symbol: "CreateWebWorkerRuntimeOptions", kind: "interface" },
      { symbol: "CreateBrowserRuntimeOptions", kind: "type" },
      { symbol: "CreateBrowserWorkerRuntimeOptions", kind: "type" },
      { symbol: "createWebSyncoreRuntime", kind: "function" },
      { symbol: "createWebWorkerRuntime", kind: "function" },
      { symbol: "createWebSyncoreClient", kind: "function" },
      { symbol: "createBrowserSyncoreRuntime", kind: "function" },
      { symbol: "createBrowserWorkerRuntime", kind: "function" },
      { symbol: "createBrowserSyncoreClient", kind: "function" },
      { symbol: "BrowserFileStorageAdapter", kind: "class" }
    ]);

    expectPublicDeclarationsToBeDocumented(reactDeclarations, [
      { symbol: "SyncoreWebProviderProps", kind: "interface" },
      { symbol: "SyncoreBrowserProviderProps", kind: "type" },
      { symbol: "SyncoreWebProvider", kind: "function" },
      { symbol: "SyncoreBrowserProvider", kind: "function" }
    ]);

    expectPublicDeclarationsToBeDocumented(workerDeclarations, [
      { symbol: "ManagedWebWorkerClient", kind: "interface" },
      { symbol: "CreateWebWorkerClientProviderOptions", kind: "interface" },
      { symbol: "createWebWorkerClient", kind: "function" },
      { symbol: "createManagedWebWorkerClient", kind: "function" },
      { symbol: "createSyncoreWebWorkerClient", kind: "function" },
      { symbol: "attachWebWorkerRuntime", kind: "function" }
    ]);
  });

  it("covers node adapter public symbols", async () => {
    const declarations = await readDeclarationFile(
      "../../platform-node/dist/index.d.mts"
    );
    const ipcDeclarations = await readDeclarationFile(
      "../../platform-node/dist/ipc.d.mts"
    );
    const ipcReactDeclarations = await readDeclarationFile(
      "../../platform-node/dist/ipc-react.d.mts"
    );

    expectPublicDeclarationsToBeDocumented(declarations, [
      { symbol: "WithNodeSyncoreClientOptions", kind: "type" },
      { symbol: "ManagedNodeSyncoreClient", kind: "interface" },
      { symbol: "createNodeSyncoreRuntime", kind: "function" },
      { symbol: "createNodeSyncoreClient", kind: "function" },
      { symbol: "createManagedNodeSyncoreClient", kind: "function" },
      { symbol: "withNodeSyncoreClient", kind: "function" },
      { symbol: "SyncoreElectronIpcMain", kind: "interface" },
      { symbol: "bindElectronWindowToSyncoreRuntime", kind: "function" }
    ]);

    expectPublicDeclarationsToBeDocumented(ipcDeclarations, [
      { symbol: "installSyncoreWindowBridge", kind: "function" },
      { symbol: "createRendererSyncoreClient", kind: "function" },
      { symbol: "createRendererSyncoreBridgeClient", kind: "function" },
      { symbol: "createRendererSyncoreWindowClient", kind: "function" }
    ]);

    expectPublicDeclarationsToBeDocumented(ipcReactDeclarations, [
      { symbol: "SyncoreElectronProviderProps", kind: "interface" },
      { symbol: "SyncoreElectronProvider", kind: "function" }
    ]);
  });

  it("covers expo adapter public symbols", async () => {
    const declarations = await readDeclarationFile(
      "../../platform-expo/dist/index.d.ts"
    );
    const reactDeclarations = await readDeclarationFile(
      "../../platform-expo/dist/react.d.ts"
    );

    expectPublicDeclarationsToBeDocumented(declarations, [
      { symbol: "CreateExpoRuntimeOptions", kind: "interface" },
      { symbol: "ExpoSyncoreBootstrap", kind: "interface" },
      { symbol: "createExpoSyncoreRuntime", kind: "function" },
      { symbol: "createExpoSyncoreClient", kind: "function" },
      { symbol: "createExpoSyncoreBootstrap", kind: "function" },
      { symbol: "ExpoSqliteDriver", kind: "class" },
      { symbol: "ExpoFileStorageAdapter", kind: "class" }
    ]);

    expectPublicDeclarationsToBeDocumented(reactDeclarations, [
      { symbol: "SyncoreExpoProviderProps", kind: "interface" },
      { symbol: "SyncoreExpoProvider", kind: "function" }
    ]);
  });

  it("covers next adapter public symbols", async () => {
    const declarations = await readDeclarationFile(
      "../../next/dist/index.d.ts"
    );
    const configDeclarations = await readDeclarationFile(
      "../../next/dist/config.d.ts"
    );

    expectPublicDeclarationsToBeDocumented(declarations, [
      { symbol: "SyncoreServiceWorkerRegistration", kind: "interface" },
      { symbol: "registerSyncoreServiceWorker", kind: "function" },
      { symbol: "createNextSyncoreClient", kind: "function" },
      { symbol: "SyncoreServiceWorker", kind: "function" },
      { symbol: "SyncoreNextProvider", kind: "function" }
    ]);

    expectPublicDeclarationsToBeDocumented(configDeclarations, [
      { symbol: "withSyncoreNext", kind: "function" },
      { symbol: "createSyncoreNextWorkerUrl", kind: "function" }
    ]);
  });
});

