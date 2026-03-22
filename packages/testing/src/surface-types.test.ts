import { describe, expectTypeOf, it } from "vitest";
import {
  defineSchema,
  defineTable,
  type FunctionArgsFromDefinition,
  type FunctionReferenceFor,
  type FunctionResultFromDefinition,
  type MutationCtx as BaseMutationCtx,
  type QueryCtx as BaseQueryCtx,
  s
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

  it("derives typed index and search-index builders from the schema", () => {
    type CollectedTask = Awaited<ReturnType<typeof collectTasksByStatus>>[number];
    type SearchedTask = Awaited<ReturnType<typeof searchTasksByTitle>>[number];

    expectTypeOf<CollectedTask["title"]>().toEqualTypeOf<string>();
    expectTypeOf<CollectedTask["status"]>().toEqualTypeOf<"todo" | "done">();
    expectTypeOf<CollectedTask["projectId"]>().toEqualTypeOf<string | null>();
    expectTypeOf<SearchedTask["title"]>().toEqualTypeOf<string>();
    expectTypeOf<SearchedTask["status"]>().toEqualTypeOf<"todo" | "done">();
    expectTypeOf<SearchedTask["projectId"]>().toEqualTypeOf<string | null>();
  });
});

function useWorkspaceQueryInference() {
  return useQuery(api.tasks.workspace, { projectId: undefined });
}

function useCreateTaskMutationInference() {
  return useMutation(api.tasks.create);
}

const localSchema = defineSchema({
  tasks: defineTable({
    title: s.string(),
    status: s.enum(["todo", "done"] as const),
    projectId: s.nullable(s.id("projects"))
  })
    .index("by_status", ["status"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["status", "projectId"]
    })
});

function collectTasksByStatus(ctx: BaseQueryCtx<typeof localSchema>) {
  return ctx.db
    .query("tasks")
    .withIndex("by_status", (range) => range.eq("status", "todo"))
    .collect();
}

function searchTasksByTitle(ctx: BaseQueryCtx<typeof localSchema>) {
  return ctx.db
    .query("tasks")
    .withSearchIndex("search_title", (search) =>
      search.search("title", "syncore").eq("status", "todo").eq("projectId", null)
    )
    .collect();
}

function assertQueryBuilderTypeErrors(ctx: BaseQueryCtx<typeof localSchema>) {
  // @ts-expect-error field not included in the index
  ctx.db.query("tasks").withIndex("by_status", (range) => range.eq("title", "syncore"));
  ctx.db.query("tasks").withSearchIndex("search_title", (search) =>
    // @ts-expect-error wrong search field
    search.search("status", "todo")
  );
  ctx.db.query("tasks").withSearchIndex("search_title", (search) =>
    // @ts-expect-error title is not a filter field on this search index
    search.search("title", "syncore").eq("title", "syncore")
  );
}

void assertQueryBuilderTypeErrors;
