import {
  SyncoreSchema,
  TableDefinition,
  defineSchema,
  type AnyTableDefinition,
  type Validator
} from "@syncore/schema";
import type { SyncoreDevtoolsEvent } from "@syncore/devtools-protocol";
import {
  type FunctionReference,
  type FunctionReferenceFor,
  type SyncoreFunctionDefinition,
  type SyncoreFunctionKind
} from "./functions.js";
import type {
  JsonObject,
  RegisteredSyncoreFunction,
  SyncoreDataModel,
  SyncoreFunctionRegistry
} from "./runtime.js";

export type ComponentPath = string;

export type SyncoreCoreCapability =
  | "storage"
  | "scheduler"
  | "devtools"
  | "ownTables"
  | "publicExports"
  | "internalActions";

export type SyncoreHostServiceName =
  | "http"
  | "notifications"
  | "secureStore"
  | "filesystem"
  | "backgroundTasks"
  | "crypto";

export type SyncoreRequestedCapability =
  | SyncoreCoreCapability
  | `host:${SyncoreHostServiceName}`;

export type AnySyncoreFunctionDefinition = SyncoreFunctionDefinition<
  SyncoreFunctionKind,
  any,
  any,
  unknown
>;

export type SyncoreFunctionTree = {
  readonly [key: string]:
    | AnySyncoreFunctionDefinition
    | SyncoreFunctionTree
    | undefined;
};

export interface SyncoreComponentHookContext {
  runtimeId: string;
  platform: string;
  componentPath: ComponentPath;
  componentName: string;
  version: string;
  config: unknown;
  capabilities: readonly SyncoreRequestedCapability[];
  emitDevtools(event: SyncoreDevtoolsEvent): void;
}

export interface SyncoreComponent<
  TConfig = unknown,
  TSchema extends SyncoreDataModel | undefined =
    | SyncoreDataModel
    | undefined,
  TPublic extends SyncoreFunctionTree | undefined =
    | SyncoreFunctionTree
    | undefined,
  TInternal extends SyncoreFunctionTree | undefined =
    | SyncoreFunctionTree
    | undefined
> {
  readonly kind: "syncore.component";
  readonly name: string;
  readonly version: string;
  readonly config?: Validator<TConfig>;
  readonly requestedCapabilities?: readonly SyncoreRequestedCapability[];
  readonly schema?: TSchema;
  readonly public?: TPublic;
  readonly internal?: TInternal;
  readonly dependencies?: readonly string[];
  onStart?(context: SyncoreComponentHookContext): Promise<void> | void;
  onStop?(context: SyncoreComponentHookContext): Promise<void> | void;
}

export interface SyncoreComponentInstall<
  TComponent extends SyncoreComponent = SyncoreComponent,
  TChildren extends SyncoreComponentsManifest = SyncoreComponentsManifest
> {
  readonly kind: "syncore.component.install";
  readonly component: TComponent;
  readonly source: string;
  readonly config?: TComponent extends SyncoreComponent<infer TConfig, any, any, any>
    ? TConfig
    : unknown;
  readonly capabilities?: readonly SyncoreRequestedCapability[];
  readonly bindings?: Record<string, string>;
  readonly children?: TChildren;
}

export type SyncoreComponentsManifest = Record<string, SyncoreComponentInstall>;

export interface SyncoreComponentFunctionMetadata {
  componentPath: ComponentPath;
  componentName: string;
  version: string;
  visibility: "public" | "internal";
  localName: string;
  localTables: Record<string, string>;
  grantedCapabilities: readonly SyncoreRequestedCapability[];
  bindings: Record<string, string>;
}

export interface ResolvedSyncoreComponent {
  alias: string;
  path: ComponentPath;
  source: string;
  name: string;
  version: string;
  config: unknown;
  grantedCapabilities: readonly SyncoreRequestedCapability[];
  requestedCapabilities: readonly SyncoreRequestedCapability[];
  bindings: Record<string, string>;
  schema: SyncoreDataModel | undefined;
  public: SyncoreFunctionTree | undefined;
  internal: SyncoreFunctionTree | undefined;
  publicEntries: Array<{
    localName: string;
    canonicalName: string;
    definition: RegisteredSyncoreFunction;
  }>;
  internalEntries: Array<{
    localName: string;
    canonicalName: string;
    definition: RegisteredSyncoreFunction;
  }>;
  localTables: Record<string, string>;
  onStart: SyncoreComponent["onStart"] | undefined;
  onStop: SyncoreComponent["onStop"] | undefined;
  children: ResolvedSyncoreComponent[];
}

type Simplify<T> = { [K in keyof T]: T[K] } & {};

type PublicFunctionTreeOf<TComponent> = TComponent extends SyncoreComponent<
  any,
  any,
  infer TPublic,
  any
>
  ? NonNullable<TPublic>
  : never;

export type FunctionReferencesForTree<TTree extends SyncoreFunctionTree> = Simplify<{
  [TKey in keyof TTree]: TTree[TKey] extends AnySyncoreFunctionDefinition
    ? FunctionReferenceFor<TTree[TKey]>
    : Record<string, unknown>;
}>;

export type InstalledComponentApi<
  TInstall extends SyncoreComponentInstall
> = Simplify<
  FunctionReferencesForTree<PublicFunctionTreeOf<TInstall["component"]>> &
    Record<string, unknown>
>;

export type InstalledComponentsApi<
  TManifest extends SyncoreComponentsManifest
> = Simplify<{
  [TAlias in keyof TManifest]: InstalledComponentApi<TManifest[TAlias]>;
}>;

type TablesOfSchema<TSchema extends SyncoreDataModel> = TSchema["tables"];

export function defineComponent<
  TConfig = unknown,
  TSchema extends SyncoreDataModel | undefined =
    | SyncoreDataModel
    | undefined,
  TPublic extends SyncoreFunctionTree | undefined =
    | SyncoreFunctionTree
    | undefined,
  TInternal extends SyncoreFunctionTree | undefined =
    | SyncoreFunctionTree
    | undefined
>(
  component: Omit<
    SyncoreComponent<TConfig, TSchema, TPublic, TInternal>,
    "kind"
  >
): SyncoreComponent<TConfig, TSchema, TPublic, TInternal> {
  return {
    kind: "syncore.component",
    ...component
  };
}

export function installComponent<
  TComponent extends SyncoreComponent,
  TChildren extends SyncoreComponentsManifest = {}
>(install: {
  component: TComponent;
  source: string;
  config?: TComponent extends SyncoreComponent<infer TConfig, any, any, any>
    ? TConfig
    : unknown;
  capabilities?: readonly SyncoreRequestedCapability[];
  bindings?: Record<string, string>;
  children?: TChildren;
}): SyncoreComponentInstall<TComponent, TChildren> {
  return {
    kind: "syncore.component.install",
    ...install
  };
}

export function defineComponents<TManifest extends SyncoreComponentsManifest>(
  components: TManifest
): TManifest {
  return components;
}

export function createBindingFunctionReference<
  TKind extends SyncoreFunctionKind,
  TArgs = JsonObject,
  TResult = unknown
>(
  kind: TKind,
  bindingName: string,
  functionName: string
): FunctionReference<TKind, TArgs, TResult> {
  return {
    kind,
    name: `binding:${bindingName}/${functionName}`
  };
}

export function composeProjectSchema<
  TRootSchema extends SyncoreDataModel
>(
  rootSchema: TRootSchema,
  manifest?: SyncoreComponentsManifest
): SyncoreSchema<TablesOfSchema<TRootSchema> & Record<string, AnyTableDefinition>> {
  const tables: Record<string, AnyTableDefinition> = {
    ...rootSchema.tables
  };

  for (const component of resolveComponentsManifest(manifest)) {
    for (const [physicalTableName, tableDefinition] of composeComponentTables(
      component
    )) {
      if (tables[physicalTableName]) {
        throw new Error(
          `Component table collision detected for ${JSON.stringify(physicalTableName)}.`
        );
      }
      tables[physicalTableName] = tableDefinition;
    }
  }

  return defineSchema(tables) as unknown as SyncoreSchema<
    TablesOfSchema<TRootSchema> & Record<string, AnyTableDefinition>
  >;
}

export function composeProjectFunctionRegistry(
  rootFunctions: SyncoreFunctionRegistry,
  manifest?: SyncoreComponentsManifest
): SyncoreFunctionRegistry {
  const registry: Record<string, RegisteredSyncoreFunction> = {};
  for (const [name, definition] of Object.entries(rootFunctions)) {
    if (definition) {
      registry[name] = definition;
    }
  }

  for (const component of resolveComponentsManifest(manifest)) {
    appendResolvedComponentFunctions(registry, component);
  }

  return registry;
}

export function createInstalledComponentsApi<
  TManifest extends SyncoreComponentsManifest
>(manifest: TManifest): InstalledComponentsApi<TManifest> {
  return createInstalledComponentsApiObject(resolveComponentsManifest(manifest)) as InstalledComponentsApi<TManifest>;
}

export function resolveComponentsManifest(
  manifest?: SyncoreComponentsManifest
): ResolvedSyncoreComponent[] {
  if (!manifest) {
    return [];
  }

  return Object.entries(manifest)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([alias, install]) => resolveInstalledComponent(alias, install, []));
}

export function toCanonicalComponentFunctionName(
  componentPath: ComponentPath,
  visibility: "public" | "internal",
  localName: string
): string {
  return ["components", componentPath, visibility, localName]
    .filter(Boolean)
    .join("/");
}

export function createComponentPhysicalTableName(
  componentPath: ComponentPath,
  tableName: string
): string {
  const pathPart = sanitizeComponentPath(componentPath);
  return `__syncore_component__${pathPart}__${tableName}`;
}

function resolveInstalledComponent(
  alias: string,
  install: SyncoreComponentInstall,
  parentPath: string[]
): ResolvedSyncoreComponent {
  const pathSegments = [...parentPath, alias];
  const componentPath = pathSegments.join("/");
  const component = install.component;
  const requestedCapabilities = [
    ...(component.requestedCapabilities ?? [])
  ];
  const localTables = createLocalTableMap(componentPath, component.schema);
  const defaultCapabilities = new Set<SyncoreRequestedCapability>(
    component.schema ? ["ownTables"] : []
  );
  if (component.public) {
    defaultCapabilities.add("publicExports");
  }
  if (component.internal) {
    defaultCapabilities.add("internalActions");
  }
  const grantedCapabilities = Array.from(
    new Set([
      ...defaultCapabilities,
      ...(install.capabilities ?? requestedCapabilities)
    ])
  );

  for (const capability of requestedCapabilities) {
    if (!grantedCapabilities.includes(capability)) {
      throw new Error(
        `Component ${JSON.stringify(component.name)} at ${JSON.stringify(componentPath)} requested capability ${JSON.stringify(capability)} but it was not granted.`
      );
    }
  }

  if (component.config) {
    component.config.parse(install.config);
  }

  const bindings = { ...(install.bindings ?? {}) };
  for (const dependency of component.dependencies ?? []) {
    if (!bindings[dependency]) {
      throw new Error(
        `Component ${JSON.stringify(component.name)} at ${JSON.stringify(componentPath)} requires binding ${JSON.stringify(dependency)}.`
      );
    }
  }

  const children = Object.entries(install.children ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([childAlias, childInstall]) =>
      resolveInstalledComponent(childAlias, childInstall, pathSegments)
    );

  return {
    alias,
    path: componentPath,
    source: install.source,
    name: component.name,
    version: component.version,
    config: install.config,
    grantedCapabilities,
    requestedCapabilities,
    bindings,
    schema: component.schema,
    public: component.public,
    internal: component.internal,
    publicEntries: flattenComponentFunctionTree(
      component.public,
      componentPath,
      component.name,
      component.version,
      "public",
      localTables,
      grantedCapabilities,
      bindings
    ),
    internalEntries: flattenComponentFunctionTree(
      component.internal,
      componentPath,
      component.name,
      component.version,
      "internal",
      localTables,
      grantedCapabilities,
      bindings
    ),
    localTables,
    onStart: component.onStart,
    onStop: component.onStop,
    children
  };
}

function createLocalTableMap(
  componentPath: string,
  schema?: SyncoreDataModel
): Record<string, string> {
  if (!schema) {
    return {};
  }
  return Object.fromEntries(
    schema.tableNames().map((tableName) => [
      tableName,
      createComponentPhysicalTableName(componentPath, tableName)
    ])
  );
}

function composeComponentTables(
  component: ResolvedSyncoreComponent
): Array<[string, AnyTableDefinition]> {
  const entries: Array<[string, AnyTableDefinition]> = [];
  if (component.schema) {
    for (const localTableName of component.schema.tableNames()) {
      const original = component.schema.getTable(localTableName);
      const cloned = new TableDefinition(original.validator, {
        ...original.options,
        tableName: localTableName,
        componentPath: component.path,
        componentName: component.name
      });
      for (const index of original.indexes) {
        if (index.fields.length > 0) {
          cloned.index(index.name, [...index.fields] as [string, ...string[]]);
        }
      }
      for (const index of original.searchIndexes) {
        cloned.searchIndex(index.name, {
          searchField: index.searchField,
          filterFields: [...index.filterFields]
        });
      }
      entries.push([component.localTables[localTableName]!, cloned]);
    }
  }
  for (const child of component.children) {
    entries.push(...composeComponentTables(child));
  }
  return entries;
}

function appendResolvedComponentFunctions(
  registry: Record<string, RegisteredSyncoreFunction>,
  component: ResolvedSyncoreComponent
): void {
  for (const entry of component.publicEntries) {
    registry[entry.canonicalName] = entry.definition;
  }
  for (const entry of component.internalEntries) {
    registry[entry.canonicalName] = entry.definition;
  }
  for (const child of component.children) {
    appendResolvedComponentFunctions(registry, child);
  }
}

function flattenComponentFunctionTree(
  tree: SyncoreFunctionTree | undefined,
  componentPath: string,
  componentName: string,
  version: string,
  visibility: "public" | "internal",
  localTables: Record<string, string>,
  grantedCapabilities: readonly SyncoreRequestedCapability[],
  bindings: Record<string, string>,
  prefix: string[] = []
): Array<{
  localName: string;
  canonicalName: string;
  definition: RegisteredSyncoreFunction;
}> {
  if (!tree) {
    return [];
  }

  const entries: Array<{
    localName: string;
    canonicalName: string;
    definition: RegisteredSyncoreFunction;
  }> = [];

  for (const [key, value] of Object.entries(tree).sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    if (!value) {
      continue;
    }
    if (isFunctionDefinition(value)) {
      const localName = [...prefix, key].join("/");
      entries.push({
        localName,
        canonicalName: toCanonicalComponentFunctionName(
          componentPath,
          visibility,
          localName
        ),
        definition: decorateComponentFunctionDefinition(value, {
          componentPath,
          componentName,
          version,
          visibility,
          localName,
          localTables,
          grantedCapabilities,
          bindings
        })
      });
      continue;
    }
    entries.push(
      ...flattenComponentFunctionTree(
        value,
        componentPath,
        componentName,
        version,
        visibility,
        localTables,
        grantedCapabilities,
        bindings,
        [...prefix, key]
      )
    );
  }

  return entries;
}

function decorateComponentFunctionDefinition(
  definition: AnySyncoreFunctionDefinition,
  metadata: SyncoreComponentFunctionMetadata
): RegisteredSyncoreFunction {
  return {
    ...definition,
    __syncoreComponent: metadata
  } as RegisteredSyncoreFunction;
}

function createInstalledComponentsApiObject(
  components: ResolvedSyncoreComponent[]
): Record<string, unknown> {
  return Object.fromEntries(
    components.map((component) => [
      component.alias,
      createInstalledComponentApiNode(component)
    ])
  );
}

function createInstalledComponentApiNode(
  component: ResolvedSyncoreComponent
): Record<string, unknown> {
  const node: Record<string, unknown> = {};
  for (const entry of component.publicEntries) {
    assignFunctionReference(
      node,
      entry.localName.split("/"),
      {
        kind: entry.definition.kind,
        name: entry.canonicalName
      }
    );
  }
  for (const child of component.children) {
    node[child.alias] = createInstalledComponentApiNode(child);
  }
  return node;
}

function assignFunctionReference(
  node: Record<string, unknown>,
  pathParts: string[],
  reference: FunctionReference
): void {
  const [head, ...tail] = pathParts;
  if (!head) {
    return;
  }
  if (tail.length === 0) {
    node[head] = reference;
    return;
  }
  const child =
    node[head] && typeof node[head] === "object"
      ? (node[head] as Record<string, unknown>)
      : {};
  node[head] = child;
  assignFunctionReference(child, tail, reference);
}

function isFunctionDefinition(value: unknown): value is AnySyncoreFunctionDefinition {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    "kind" in (value as Record<string, unknown>) &&
    "argsValidator" in (value as Record<string, unknown>) &&
    "handler" in (value as Record<string, unknown>)
  );
}

function sanitizeComponentPath(componentPath: string): string {
  return componentPath.replace(/[^a-zA-Z0-9_]+/g, "_");
}
