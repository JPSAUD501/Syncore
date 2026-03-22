import { describe, expect, it } from "vitest";
import { defineSchema, defineTable, s } from "../../../schema/src/index.js";
import { mutation, query } from "./functions.js";
import {
  composeProjectFunctionRegistry,
  composeProjectSchema,
  createInstalledComponentsApi,
  defineComponent,
  defineComponents,
  installComponent
} from "./components.js";

describe("components composition", () => {
  it("composes namespaced tables, canonical functions, and installed refs", () => {
    const notesComponent = defineComponent({
      name: "notes",
      version: "1.0.0",
      schema: defineSchema({
        notes: defineTable({
          body: s.string()
        })
      }),
      public: {
        list: query({
          args: {},
          handler: async () => []
        })
      },
      internal: {
        touch: mutation({
          args: {},
          handler: async () => null
        })
      }
    });

    const searchComponent = defineComponent({
      name: "search",
      version: "1.0.0",
      public: {
        refresh: mutation({
          args: {},
          handler: async () => null
        })
      }
    });

    const manifest = defineComponents({
      alpha: installComponent({
        component: notesComponent,
        source: "@example/notes"
      }),
      beta: installComponent({
        component: notesComponent,
        source: "@example/notes"
      }),
      tools: installComponent({
        component: searchComponent,
        source: "@example/search",
        children: {
          nested: installComponent({
            component: notesComponent,
            source: "@example/notes"
          })
        }
      })
    });

    const rootSchema = defineSchema({
      tasks: defineTable({
        text: s.string()
      })
    });

    const schema = composeProjectSchema(rootSchema, manifest);
    expect(schema.tableNames()).toEqual([
      "tasks",
      "__syncore_component__alpha__notes",
      "__syncore_component__beta__notes",
      "__syncore_component__tools_nested__notes"
    ]);

    const functions = composeProjectFunctionRegistry({}, manifest);
    expect(Object.keys(functions).sort()).toEqual([
      "components/alpha/internal/touch",
      "components/alpha/public/list",
      "components/beta/internal/touch",
      "components/beta/public/list",
      "components/tools/nested/internal/touch",
      "components/tools/nested/public/list",
      "components/tools/public/refresh"
    ]);

    const installed = createInstalledComponentsApi(manifest) as Record<
      string,
      Record<string, unknown>
    >;
    expect((installed.alpha as Record<string, unknown>).list).toEqual({
      kind: "query",
      name: "components/alpha/public/list"
    });
    expect((installed.tools as Record<string, unknown>).refresh).toEqual({
      kind: "mutation",
      name: "components/tools/public/refresh"
    });
    expect(
      (
        (installed.tools as Record<string, unknown>).nested as Record<
          string,
          unknown
        >
      ).list
    ).toEqual({
      kind: "query",
      name: "components/tools/nested/public/list"
    });
  });
});

