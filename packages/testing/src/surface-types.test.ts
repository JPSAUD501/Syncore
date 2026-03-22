import { describe, expectTypeOf, it } from "vitest";
import {
  type FunctionArgsFromDefinition,
  type FunctionReferenceFor,
  type FunctionResultFromDefinition,
  type MutationCtx as BaseMutationCtx,
  type QueryCtx as BaseQueryCtx
} from "syncorejs";
import { createNextSyncoreClient } from "syncorejs/next";
import { withSyncoreNext } from "syncorejs/next/config";
import { useMutation, useQuery } from "syncorejs/react";
import type { ManagedWebWorkerClient } from "syncorejs/browser";
import type schema from "../../../examples/next-pwa/syncore/schema";
import { api } from "../../../examples/next-pwa/syncore/_generated/api";
import {
  type MutationCtx as GeneratedMutationCtx,
  type QueryCtx as GeneratedQueryCtx
} from "../../../examples/next-pwa/syncore/_generated/server";
import type { create as tasksCreate } from "../../../examples/next-pwa/syncore/functions/tasks";
import type { workspace as tasksWorkspace } from "../../../examples/next-pwa/syncore/functions/tasks";

describe("syncorejs public type surface", () => {
  it("keeps generated api references aligned with source function definitions", () => {
    expectTypeOf(api.tasks.workspace).toEqualTypeOf<
      FunctionReferenceFor<typeof tasksWorkspace>
    >();
    expectTypeOf(api.tasks.create).toEqualTypeOf<
      FunctionReferenceFor<typeof tasksCreate>
    >();
  });

  it("keeps generated server contexts aligned with the app schema", () => {
    expectTypeOf<GeneratedQueryCtx>().toEqualTypeOf<
      BaseQueryCtx<typeof schema>
    >();
    expectTypeOf<GeneratedMutationCtx>().toEqualTypeOf<
      BaseMutationCtx<typeof schema>
    >();
  });

  it("preserves hook inference for public function references", () => {
    type WorkspaceQueryResult = ReturnType<typeof useWorkspaceQueryInference>;
    type CreateTaskMutation = ReturnType<typeof useCreateTaskMutationInference>;

    expectTypeOf<WorkspaceQueryResult>().toEqualTypeOf<
      FunctionResultFromDefinition<typeof tasksWorkspace> | undefined
    >();
    expectTypeOf<CreateTaskMutation>().parameters.toEqualTypeOf<
      [FunctionArgsFromDefinition<typeof tasksCreate>]
    >();
    expectTypeOf<CreateTaskMutation>().returns.toEqualTypeOf<
      Promise<FunctionResultFromDefinition<typeof tasksCreate>>
    >();
  });

  it("keeps next integration callable through the public config subpath", () => {
    const nextConfig = withSyncoreNext({
      output: "export" as const
    });

    expectTypeOf(nextConfig.output).toEqualTypeOf<"export">();
    expectTypeOf(createNextSyncoreClient).returns.toEqualTypeOf<
      ManagedWebWorkerClient
    >();
  });

  it("exposes browser, node, expo, and svelte modules through the public package surface", () => {
    type BrowserModule = typeof import("syncorejs/browser");
    type BrowserReactModule = typeof import("syncorejs/browser/react");
    type NodeModule = typeof import("syncorejs/node");
    type NodeIpcModule = typeof import("syncorejs/node/ipc");
    type NodeIpcReactModule = typeof import("syncorejs/node/ipc/react");
    type ExpoModule = typeof import("syncorejs/expo");
    type ExpoReactModule = typeof import("syncorejs/expo/react");
    type SvelteModule = typeof import("syncorejs/svelte");

    expectTypeOf<BrowserModule["createBrowserSyncoreRuntime"]>().toBeFunction();
    expectTypeOf<BrowserModule["createBrowserWorkerClient"]>().toBeFunction();
    expectTypeOf<BrowserReactModule["SyncoreBrowserProvider"]>().toBeFunction();
    expectTypeOf<NodeModule["createNodeSyncoreRuntime"]>().toBeFunction();
    expectTypeOf<NodeIpcModule["createRendererSyncoreClient"]>().toBeFunction();
    expectTypeOf<NodeIpcReactModule["SyncoreElectronProvider"]>().toBeFunction();
    expectTypeOf<ExpoModule["createExpoSyncoreRuntime"]>().toBeFunction();
    expectTypeOf<ExpoModule["createExpoSyncoreBootstrap"]>().toBeFunction();
    expectTypeOf<ExpoReactModule["SyncoreExpoProvider"]>().toBeFunction();
    expectTypeOf<SvelteModule["createQueryStore"]>().toBeFunction();
  });
});

function useWorkspaceQueryInference() {
  return useQuery(api.tasks.workspace, { projectId: undefined });
}

function useCreateTaskMutationInference() {
  return useMutation(api.tasks.create);
}
