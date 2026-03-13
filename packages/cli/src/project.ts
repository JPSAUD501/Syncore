import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import AdmZip from "adm-zip";
import type {
  FunctionReference,
  RegisteredSyncoreFunction,
  SyncoreFunctionRegistry
} from "@syncore/core";
import type {
  SyncoreDevtoolsClientMessage,
  SyncoreDevtoolsCommandPayload,
  SyncoreDevtoolsCommandResultPayload,
  SyncoreDevtoolsMessage,
  SyncoreDevtoolsSubscriptionPayload,
  SyncoreDevtoolsSubscriptionResultPayload
} from "@syncore/devtools-protocol";
import {
  createBasePublicId,
  createPublicRuntimeId as createSharedPublicRuntimeId,
  createPublicTargetId as createSharedPublicTargetId
} from "@syncore/devtools-protocol";
import {
  type DevHubSessionState,
  VALID_SYNCORE_TEMPLATES,
  detectProjectTemplate,
  fileExists,
  importJsonlIntoProject,
  isLocalPortInUse,
  loadProjectConfig,
  loadProjectFunctions,
  loadProjectSchema,
  resolveProjectTargetConfig,
  runCodegen,
  resolvePortFromEnv
} from "@syncore/core/cli";
import {
  createManagedNodeSyncoreClient,
  NodeSqliteDriver
} from "@syncore/platform-node";
import WebSocket from "ws";

export interface ProjectPaths {
  databasePath: string;
  storageDirectory: string;
}

export interface TableSummary {
  name: string;
  documentCount: number;
}

export interface TableRowsResult {
  table: string;
  rows: Array<Record<string, unknown>>;
}

export interface ImportSource {
  table: string;
  filePath: string;
}

export interface ImportDocumentBatch {
  table: string;
  rows: Array<Record<string, unknown>>;
}

export interface WorkspaceProjectMatch {
  path: string;
  relativePath: string;
  template: string;
}

export type TargetCapability =
  | "run"
  | "readData"
  | "writeData"
  | "exportData"
  | "streamLogs";

export interface ClientRuntimeDescriptor {
  id: string;
  runtimeId: string;
  label: string;
  platform: string;
  appName?: string;
  origin?: string;
  sessionLabel?: string;
  storageIdentity?: string;
  online: true;
  primary: boolean;
}

export interface ClientRuntimeLookupEntry extends ClientRuntimeDescriptor {
  targetId: string;
  targetLabel: string;
}

const PROJECT_TARGET_CAPABILITIES: TargetCapability[] = [
  "run",
  "readData",
  "writeData",
  "exportData"
];

const CLIENT_TARGET_CAPABILITIES: TargetCapability[] = [
  "run",
  "readData",
  "writeData",
  "exportData",
  "streamLogs"
];

export interface ClientTargetDescriptor {
  id: string;
  kind: "client";
  label: string;
  runtimeId: string;
  runtimeIds: string[];
  runtimes: ClientRuntimeDescriptor[];
  platform: string;
  appName?: string;
  origin?: string;
  sessionLabels: string[];
  storageProtocol?: string;
  databaseLabel?: string;
  storageIdentity?: string;
  connectedSessions: number;
  online: true;
  capabilities: TargetCapability[];
}

export interface ProjectTargetDescriptor {
  id: "project";
  kind: "project";
  label: string;
  databasePath: string;
  storageDirectory: string;
  online: true;
  capabilities: TargetCapability[];
}

export type SyncoreTargetDescriptor =
  | ProjectTargetDescriptor
  | ClientTargetDescriptor;

export function createPublicRuntimeId(
  runtimeId: string,
  runtimeIds?: Iterable<string>
): string {
  return createSharedPublicRuntimeId(runtimeId, runtimeIds);
}

export function getClientRuntimeLabel(input: {
  sessionLabel?: string;
  appName?: string;
  platform: string;
}): string {
  return input.sessionLabel ?? input.appName ?? input.platform;
}

export function buildRuntimeLookup(
  targets: SyncoreTargetDescriptor[]
): Map<string, ClientRuntimeLookupEntry> {
  const lookup = new Map<string, ClientRuntimeLookupEntry>();
  for (const target of targets) {
    if (target.kind !== "client") {
      continue;
    }
    for (const runtime of target.runtimes) {
      lookup.set(runtime.runtimeId, {
        ...runtime,
        targetId: target.id,
        targetLabel: target.label
      });
    }
  }
  return lookup;
}

export async function resolveProjectPaths(
  cwd: string
): Promise<ProjectPaths | null> {
  const configPath = path.join(cwd, "syncore.config.ts");
  if (!(await fileExists(configPath))) {
    return null;
  }
  const config = await loadProjectConfig(cwd);
  const projectTarget = resolveProjectTargetConfig(config);
  if (!projectTarget) {
    return null;
  }
  return {
    databasePath: path.resolve(cwd, projectTarget.databasePath),
    storageDirectory: path.resolve(cwd, projectTarget.storageDirectory)
  };
}

export async function requireProjectPaths(cwd: string): Promise<ProjectPaths> {
  const paths = await resolveProjectPaths(cwd);
  if (!paths) {
    throw new Error(
      "This Syncore project does not define a projectTarget. Use a connected client target instead."
    );
  }
  return paths;
}

export async function resolveProjectTargetDescriptor(
  cwd: string
): Promise<ProjectTargetDescriptor | null> {
  const paths = await resolveProjectPaths(cwd);
  if (!paths) {
    return null;
  }

  return {
    id: "project",
    kind: "project",
    label: `project (${path.basename(paths.databasePath)})`,
    databasePath: paths.databasePath,
    storageDirectory: paths.storageDirectory,
    online: true,
    capabilities: [...PROJECT_TARGET_CAPABILITIES]
  };
}

export async function createManagedProjectClient(cwd: string) {
  const [paths, schema, functions] = await Promise.all([
    requireProjectPaths(cwd),
    loadProjectSchema(cwd),
    loadRuntimeProjectFunctions(cwd)
  ]);

  return await createManagedNodeSyncoreClient({
    databasePath: paths.databasePath,
    storageDirectory: paths.storageDirectory,
    schema,
    functions,
    devtools: false,
    platform: "cli"
  });
}

export async function listProjectFunctions(
  cwd: string
): Promise<Array<{ name: string; kind: RegisteredSyncoreFunction["kind"] }>> {
  const functions = await loadRuntimeProjectFunctions(cwd);
  return Object.entries(functions)
    .filter((entry): entry is [string, RegisteredSyncoreFunction] => Boolean(entry[1]))
    .map(([name, definition]) => ({
      name,
      kind: definition.kind
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function resolveProjectFunction(
  cwd: string,
  requestedName: string
): Promise<{
  name: string;
  definition: RegisteredSyncoreFunction;
  reference: FunctionReference;
}> {
  const functions = await loadRuntimeProjectFunctions(cwd);
  const normalizedName = normalizeFunctionName(requestedName, functions);
  const definition = functions[normalizedName];
  if (!definition) {
    const available = Object.keys(functions).sort((left, right) =>
      left.localeCompare(right)
    );
    const suggestions = suggestFunctionNames(requestedName, available);
    throw new Error(
      `Unknown function ${JSON.stringify(requestedName)}.${suggestions.length > 0 ? ` Did you mean: ${suggestions.join(", ")}?` : ""} Available functions: ${available.join(", ")}`
    );
  }

  return {
    name: normalizedName,
    definition,
    reference: {
      kind: definition.kind,
      name: normalizedName
    }
  };
}

function suggestFunctionNames(
  requestedName: string,
  available: string[]
): string[] {
  const normalized = requestedName
    .trim()
    .replace(/^api\./, "")
    .replaceAll(".", "/")
    .replaceAll(":", "/")
    .toLowerCase();
  return available
    .map((name) => ({
      name,
      score:
        (name.toLowerCase() === normalized ? 100 : 0) +
        (name.toLowerCase().startsWith(normalized) ? 30 : 0) +
        (name.toLowerCase().includes(normalized) ? 20 : 0) +
        sharedSegmentsScore(normalized, name.toLowerCase())
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
    .slice(0, 5)
    .map((entry) => entry.name);
}

function sharedSegmentsScore(left: string, right: string): number {
  const leftSegments = left.split("/").filter(Boolean);
  const rightSegments = right.split("/").filter(Boolean);
  let score = 0;
  for (const segment of leftSegments) {
    if (rightSegments.includes(segment)) {
      score += 10;
    }
  }
  return score;
}

export function normalizeFunctionName(
  requestedName: string,
  functions: SyncoreFunctionRegistry
): string {
  const trimmed = requestedName.trim();
  const candidates = [
    trimmed,
    trimmed.replace(/^api\./, "").replaceAll(".", "/"),
    trimmed.replace(/^api\./, "").replaceAll(".", "/").replaceAll(":", "/"),
    trimmed.replaceAll(":", "/"),
    trimmed.replaceAll(".", "/")
  ];

  for (const candidate of candidates) {
    if (functions[candidate]) {
      return candidate;
    }
  }

  return trimmed.replace(/^api\./, "").replaceAll(".", "/").replaceAll(":", "/");
}

export async function listProjectTables(cwd: string): Promise<TableSummary[]> {
  const [paths, schema] = await Promise.all([
    requireProjectPaths(cwd),
    loadProjectSchema(cwd)
  ]);
  await mkdir(path.dirname(paths.databasePath), { recursive: true });
  const driver = new NodeSqliteDriver(paths.databasePath);

  try {
    const results: TableSummary[] = [];
    for (const tableName of schema.tableNames()) {
      const row = await driver.get<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ${quoteIdentifier(tableName)}`
      );
      results.push({
        name: tableName,
        documentCount: Number(row?.count ?? 0)
      });
    }
    return results;
  } finally {
    await driver.close();
  }
}

export async function readProjectTable(
  cwd: string,
  tableName: string,
  options: {
    limit: number;
    order: "asc" | "desc";
  }
): Promise<TableRowsResult> {
  const paths = await requireProjectPaths(cwd);
  const driver = new NodeSqliteDriver(paths.databasePath);

  try {
    const rows = await driver.all<{
      _id: string;
      _creationTime: number;
      _json: string;
    }>(
      `SELECT _id, _creationTime, _json FROM ${quoteIdentifier(tableName)} ORDER BY _creationTime ${options.order.toUpperCase()} LIMIT ?`,
      [options.limit]
    );
    return {
      table: tableName,
      rows: rows.map((row) => ({
        _id: row._id,
        _creationTime: row._creationTime,
        ...(JSON.parse(row._json) as Record<string, unknown>)
      }))
    };
  } finally {
    await driver.close();
  }
}

export async function exportProjectData(
  cwd: string,
  outputPath: string,
  options: {
    table?: string;
  } = {}
): Promise<{
  path: string;
  tables: string[];
  format: "json" | "jsonl" | "directory" | "zip";
}> {
  const resolvedOutput = path.resolve(cwd, outputPath);
  const tables = options.table
    ? [options.table]
    : (await listProjectTables(cwd)).map((table) => table.name);
  if (tables.length === 0) {
    throw new Error("No tables are available to export.");
  }

  const payloads = await Promise.all(
    tables.map(async (table) => ({
      table,
      rows: (
        await readProjectTable(cwd, table, {
          limit: Number.MAX_SAFE_INTEGER,
          order: "asc"
        })
      ).rows
    }))
  );

  return await writeExportData(resolvedOutput, payloads);
}

export async function writeExportData(
  resolvedOutput: string,
  payloads: Array<{ table: string; rows: Array<Record<string, unknown>> }>
): Promise<{
  path: string;
  tables: string[];
  format: "json" | "jsonl" | "directory" | "zip";
}> {
  const tables = payloads.map((payload) => payload.table);
  if (tables.length === 0) {
    throw new Error("No tables are available to export.");
  }

  const extension = path.extname(resolvedOutput).toLowerCase();
  if (extension === ".json" || extension === ".jsonl") {
    if (tables.length !== 1) {
      throw new Error(
        `Single-file exports require --table. Available tables: ${tables.join(", ")}`
      );
    }
    const payload = payloads[0]!;
    await mkdir(path.dirname(resolvedOutput), { recursive: true });
    await writeFile(
      resolvedOutput,
      extension === ".json"
        ? `${JSON.stringify(payload.rows, null, 2)}\n`
        : `${payload.rows.map((row) => JSON.stringify(row)).join("\n")}\n`
    );
    return {
      path: resolvedOutput,
      tables: [payload.table],
      format: extension === ".json" ? "json" : "jsonl"
    };
  }

  if (extension === ".zip") {
    const zip = new AdmZip();
    for (const payload of payloads) {
      zip.addFile(
        `${payload.table}.jsonl`,
        Buffer.from(
          `${payload.rows.map((row) => JSON.stringify(row)).join("\n")}\n`
        )
      );
    }
    await mkdir(path.dirname(resolvedOutput), { recursive: true });
    zip.writeZip(resolvedOutput);
    return {
      path: resolvedOutput,
      tables,
      format: "zip"
    };
  }

  await mkdir(resolvedOutput, { recursive: true });
  for (const payload of payloads) {
    await writeFile(
      path.join(resolvedOutput, `${payload.table}.jsonl`),
      `${payload.rows.map((row) => JSON.stringify(row)).join("\n")}\n`
    );
  }

  return {
    path: resolvedOutput,
    tables,
    format: "directory"
  };
}

export async function importProjectData(
  cwd: string,
  sourcePath: string,
  options: {
    table?: string;
  } = {}
): Promise<Array<{ table: string; importedCount: number }>> {
  const resolvedSource = path.resolve(cwd, sourcePath);
  const extension = path.extname(resolvedSource).toLowerCase();
  const cleanupDirectories: string[] = [];

  try {
    const sources =
      extension === ".zip"
        ? await extractImportSourcesFromZip(resolvedSource, cleanupDirectories)
        : await resolveImportSources(
            resolvedSource,
            options.table,
            cleanupDirectories
          );

    const imported = [] as Array<{ table: string; importedCount: number }>;
    for (const source of sources) {
      const importedCount = await importJsonlIntoProject(
        cwd,
        source.table,
        source.filePath
      );
      imported.push({
        table: source.table,
        importedCount
      });
    }
    return imported;
  } finally {
    for (const directory of cleanupDirectories) {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

export async function loadImportDocumentBatches(
  cwd: string,
  sourcePath: string,
  options: {
    table?: string;
  } = {}
): Promise<ImportDocumentBatch[]> {
  const resolvedSource = path.resolve(cwd, sourcePath);
  const extension = path.extname(resolvedSource).toLowerCase();
  const cleanupDirectories: string[] = [];

  try {
    const sources =
      extension === ".zip"
        ? await extractImportSourcesFromZip(resolvedSource, cleanupDirectories)
        : await resolveImportSources(
            resolvedSource,
            options.table,
            cleanupDirectories
          );

    return await Promise.all(
      sources.map(async (source) => ({
        table: source.table,
        rows: await readJsonlRows(source.filePath)
      }))
    );
  } finally {
    for (const directory of cleanupDirectories) {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

export async function findWorkspaceSyncoreProjects(
  cwd: string
): Promise<WorkspaceProjectMatch[]> {
  const packageJsonPath = path.join(cwd, "package.json");
  if (!(await fileExists(packageJsonPath))) {
    return [];
  }

  let workspaces: string[] = [];
  try {
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
      workspaces?: string[];
    };
    workspaces = packageJson.workspaces ?? [];
  } catch {
    return [];
  }

  const directories = new Set<string>();
  for (const workspace of workspaces) {
    const prefix = workspace.replace(/\/\*+$/, "");
    const fullPrefix = path.join(cwd, prefix);
    if (!(await fileExists(fullPrefix))) {
      continue;
    }
    const entries = await readdir(fullPrefix, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        directories.add(path.join(fullPrefix, entry.name));
      }
    }
  }

  const matches: WorkspaceProjectMatch[] = [];
  for (const directory of directories) {
    if (!(await fileExists(path.join(directory, "syncore.config.ts")))) {
      continue;
    }
    matches.push({
      path: directory,
      relativePath: path.relative(cwd, directory).replaceAll("\\", "/"),
      template: await detectProjectTemplate(directory)
    });
  }
  return matches.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  );
}

export async function resolveDocsTarget(cwd: string): Promise<string> {
  const template = await detectProjectTemplate(cwd);
  const docsFile =
    template === "react-web"
      ? path.join("docs", "quickstarts", "react-web.md")
      : template === "next"
        ? path.join("docs", "quickstarts", "next-pwa.md")
        : template === "expo"
          ? path.join("docs", "quickstarts", "expo.md")
          : template === "electron"
            ? path.join("docs", "quickstarts", "electron.md")
            : template === "node"
              ? path.join("docs", "quickstarts", "node-script.md")
              : path.join("README.md");

  return pathToFileURL(
    path.resolve(import.meta.dirname, "..", "..", "..", docsFile)
  ).href;
}

export function resolveDashboardUrl(): string {
  return `http://localhost:${resolvePortFromEnv("SYNCORE_DASHBOARD_PORT", 4310)}`;
}

export async function resolveActiveDashboardUrl(cwd: string): Promise<string> {
  const session = await readDevtoolsSessionState(cwd);
  return session?.authenticatedDashboardUrl ?? resolveDashboardUrl();
}

export function resolveDevtoolsUrl(): string {
  return `ws://127.0.0.1:${resolvePortFromEnv("SYNCORE_DEVTOOLS_PORT", 4311)}`;
}

export async function readDevtoolsSessionState(
  cwd: string
): Promise<DevHubSessionState | null> {
  const sessionPath = path.join(cwd, ".syncore", "devtools-session.json");
  if (!(await fileExists(sessionPath))) {
    return null;
  }

  try {
    const source = await readFile(sessionPath, "utf8");
    const parsed = JSON.parse(source) as Partial<DevHubSessionState>;
    if (
      typeof parsed.dashboardUrl !== "string" ||
      typeof parsed.authenticatedDashboardUrl !== "string" ||
      typeof parsed.devtoolsUrl !== "string" ||
      typeof parsed.token !== "string"
    ) {
      return null;
    }
    return {
      dashboardUrl: parsed.dashboardUrl,
      authenticatedDashboardUrl: parsed.authenticatedDashboardUrl,
      devtoolsUrl: parsed.devtoolsUrl,
      token: parsed.token
    };
  } catch {
    return null;
  }
}

type RuntimeHello = Extract<SyncoreDevtoolsMessage, { type: "hello" }>;
type RuntimeEventMessage = Extract<SyncoreDevtoolsMessage, { type: "event" }>;

interface HubConnection {
  collectSnapshot(timeoutMs?: number): Promise<{
    hellos: RuntimeHello[];
    events: RuntimeEventMessage["event"][];
  }>;
  listRuntimeHellos(): RuntimeHello[];
  onEvent(listener: (event: RuntimeEventMessage["event"]) => void): () => void;
  sendCommand(
    runtimeId: string,
    payload: SyncoreDevtoolsCommandPayload
  ): Promise<SyncoreDevtoolsCommandResultPayload>;
  subscribe(
    runtimeId: string,
    payload: SyncoreDevtoolsSubscriptionPayload,
    handlers: {
      onData(payload: SyncoreDevtoolsSubscriptionResultPayload): void;
      onError?(error: string): void;
    }
  ): () => void;
  dispose(): Promise<void>;
}

export async function listConnectedClientTargets(
  devtoolsUrl = resolveDevtoolsUrl()
): Promise<ClientTargetDescriptor[]> {
  const port = Number.parseInt(new URL(devtoolsUrl).port, 10);
  if (!Number.isFinite(port) || !(await isLocalPortInUse(port))) {
    return [];
  }

  let hub: HubConnection;
  try {
    hub = await connectToDevtoolsHub(devtoolsUrl);
  } catch {
    return [];
  }
  try {
    const snapshot = await hub.collectSnapshot();
    return buildClientTargets(snapshot.hellos);
  } finally {
    await hub.dispose();
  }
}

export async function listAvailableTargets(
  cwd: string
): Promise<SyncoreTargetDescriptor[]> {
  const [projectTarget, clientTargets] = await Promise.all([
    resolveProjectTargetDescriptor(cwd),
    listConnectedClientTargets()
  ]);

  return [
    ...(projectTarget ? [projectTarget] : []),
    ...clientTargets
  ];
}

export async function connectToProjectHub(
  devtoolsUrl = resolveDevtoolsUrl()
): Promise<HubConnection | null> {
  const port = Number.parseInt(new URL(devtoolsUrl).port, 10);
  if (!Number.isFinite(port) || !(await isLocalPortInUse(port))) {
    return null;
  }
  try {
    return await connectToDevtoolsHub(devtoolsUrl);
  } catch {
    return null;
  }
}

export function isKnownTemplate(value: string): value is (typeof VALID_SYNCORE_TEMPLATES)[number] {
  return VALID_SYNCORE_TEMPLATES.includes(
    value as (typeof VALID_SYNCORE_TEMPLATES)[number]
  );
}

async function loadRuntimeProjectFunctions(
  cwd: string
): Promise<SyncoreFunctionRegistry> {
  try {
    return await loadProjectFunctions(cwd);
  } catch (error) {
    if (!(await fileExists(path.join(cwd, "syncore", "functions")))) {
      throw error;
    }

    await runCodegen(cwd);
    return await loadProjectFunctions(cwd);
  }
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function resolveImportSources(
  sourcePath: string,
  explicitTable: string | undefined,
  cleanupDirectories: string[]
): Promise<ImportSource[]> {
  const extension = path.extname(sourcePath).toLowerCase();
  if (extension === ".jsonl") {
    if (!explicitTable) {
      throw new Error("`syncorejs import` requires --table when importing a .jsonl file.");
    }
    return [{ table: explicitTable, filePath: sourcePath }];
  }

  if (extension === ".json") {
    if (!explicitTable) {
      throw new Error("`syncorejs import` requires --table when importing a .json file.");
    }
    const rows = JSON.parse(await readFile(sourcePath, "utf8")) as unknown;
    if (!Array.isArray(rows)) {
      throw new Error(`${sourcePath} must contain a JSON array.`);
    }
    const { directory, filePath } = await writeRowsToTempJsonl(rows);
    cleanupDirectories.push(directory);
    return [{ table: explicitTable, filePath }];
  }

  if (await isDirectory(sourcePath)) {
    const entries = await readdir(sourcePath, { withFileTypes: true });
    const sources: ImportSource[] = [];
    for (const entry of entries) {
      const fullPath = path.join(sourcePath, entry.name);
      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        sources.push({
          table: entry.name.replace(/\.jsonl$/i, ""),
          filePath: fullPath
        });
      }
      if (entry.isDirectory()) {
        const nestedPath = path.join(fullPath, "documents.jsonl");
        if (await fileExists(nestedPath)) {
          sources.push({
            table: entry.name,
            filePath: nestedPath
          });
        }
      }
    }
    if (sources.length === 0) {
      throw new Error(`No importable JSONL files were found in ${sourcePath}.`);
    }
    return sources.sort((left, right) => left.table.localeCompare(right.table));
  }

  throw new Error(`Unsupported import source: ${sourcePath}`);
}

async function extractImportSourcesFromZip(
  sourcePath: string,
  cleanupDirectories: string[]
): Promise<ImportSource[]> {
  const tempDirectory = await mkdtemp(
    path.join(os.tmpdir(), "syncore-cli-import-")
  );
  cleanupDirectories.push(tempDirectory);
  const zip = new AdmZip(sourcePath);
  await assertSafeZipExtractionPaths(sourcePath, zip, tempDirectory);
  zip.extractAllTo(tempDirectory, true);
  return await resolveImportSources(tempDirectory, undefined, cleanupDirectories);
}

async function assertSafeZipExtractionPaths(
  sourcePath: string,
  zip: AdmZip,
  extractionDirectory: string
): Promise<void> {
  const resolvedExtractionDirectory = path.resolve(extractionDirectory);
  const extractionRoot = `${resolvedExtractionDirectory}${path.sep}`;

  for (const entryPath of await readRawZipEntryPaths(sourcePath)) {
    assertSafeZipEntryPath(
      entryPath,
      resolvedExtractionDirectory,
      extractionRoot
    );
  }

  for (const entry of zip.getEntries()) {
    assertSafeZipEntryPath(
      entry.entryName,
      resolvedExtractionDirectory,
      extractionRoot
    );
  }
}

function assertSafeZipEntryPath(
  entryName: string,
  resolvedExtractionDirectory: string,
  extractionRoot: string
): void {
  const entryPath = entryName.replaceAll("\\", "/");
  if (path.posix.isAbsolute(entryPath) || /^[A-Za-z]:/.test(entryPath)) {
    throw new Error(`Invalid ZIP entry path: ${entryName}`);
  }

  const extractionTarget = path.resolve(resolvedExtractionDirectory, entryPath);
  if (
    extractionTarget !== resolvedExtractionDirectory &&
    !extractionTarget.startsWith(extractionRoot)
  ) {
    throw new Error(`Invalid ZIP entry path: ${entryName}`);
  }
}

async function readRawZipEntryPaths(sourcePath: string): Promise<string[]> {
  const archive = await readFile(sourcePath);
  const endOfCentralDirectoryOffset = findEndOfCentralDirectoryOffset(archive);
  if (endOfCentralDirectoryOffset < 0) {
    throw new Error(`Invalid ZIP archive: ${sourcePath}`);
  }

  const entryCount = archive.readUInt16LE(endOfCentralDirectoryOffset + 10);
  const centralDirectorySize = archive.readUInt32LE(
    endOfCentralDirectoryOffset + 12
  );
  const centralDirectoryOffset = archive.readUInt32LE(
    endOfCentralDirectoryOffset + 16
  );
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  if (centralDirectoryEnd > archive.length) {
    throw new Error(`Invalid ZIP archive: ${sourcePath}`);
  }

  const entryPaths: string[] = [];
  let cursor = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > centralDirectoryEnd) {
      throw new Error(`Invalid ZIP archive: ${sourcePath}`);
    }
    if (archive.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error(`Invalid ZIP archive: ${sourcePath}`);
    }

    const flags = archive.readUInt16LE(cursor + 8);
    const fileNameLength = archive.readUInt16LE(cursor + 28);
    const extraFieldLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const fileNameStart = cursor + 46;
    const fileNameEnd = fileNameStart + fileNameLength;
    const nextEntryOffset = fileNameEnd + extraFieldLength + commentLength;
    if (nextEntryOffset > centralDirectoryEnd) {
      throw new Error(`Invalid ZIP archive: ${sourcePath}`);
    }

    entryPaths.push(
      decodeZipEntryPath(archive.subarray(fileNameStart, fileNameEnd), flags)
    );
    cursor = nextEntryOffset;
  }

  return entryPaths;
}

function findEndOfCentralDirectoryOffset(archive: Buffer): number {
  const minOffset = Math.max(0, archive.length - 0xffff - 22);
  for (let offset = archive.length - 22; offset >= minOffset; offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  return -1;
}

function decodeZipEntryPath(entryPath: Buffer, flags: number): string {
  return entryPath.toString((flags & 0x0800) === 0 ? "latin1" : "utf8");
}

async function writeRowsToTempJsonl(rows: unknown[]): Promise<{
  directory: string;
  filePath: string;
}> {
  const tempDirectory = await mkdtemp(
    path.join(os.tmpdir(), "syncore-cli-json-")
  );
  const tempFile = path.join(tempDirectory, "rows.jsonl");
  await writeFile(
    tempFile,
    `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`
  );
  return {
    directory: tempDirectory,
    filePath: tempFile
  };
}

async function readJsonlRows(
  filePath: string
): Promise<Array<Record<string, unknown>>> {
  const source = await readFile(filePath, "utf8");
  const rows: Array<Record<string, unknown>> = [];
  let lineNumber = 0;

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    lineNumber += 1;
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(
        `Line ${lineNumber} of ${filePath} must contain a JSON object.`
      );
    }
    rows.push(parsed as Record<string, unknown>);
  }

  return rows;
}

async function isDirectory(filePath: string): Promise<boolean> {
  try {
    const entries = await readdir(filePath);
    return Array.isArray(entries);
  } catch {
    return false;
  }
}

async function connectToDevtoolsHub(url: string): Promise<HubConnection> {
  const socket = new WebSocket(url);
  socket.on("error", () => {
    // The hub can disappear between the port probe and the websocket handshake.
    // Keep those transient client-side failures from surfacing as process-level errors.
  });
  const hellos = new Map<string, RuntimeHello>();
  const events: RuntimeEventMessage["event"][] = [];
  const eventListeners = new Set<(event: RuntimeEventMessage["event"]) => void>();
  let lastSnapshotMessageAt = 0;
  const commandResolvers = new Map<
    string,
    {
      resolve(payload: SyncoreDevtoolsCommandResultPayload): void;
      reject(error: Error): void;
    }
  >();
  const subscriptionHandlers = new Map<
    string,
    {
      onData(payload: SyncoreDevtoolsSubscriptionResultPayload): void;
      onError?(error: string): void;
    }
  >();

  socket.on("message", (rawPayload) => {
    const payload =
      typeof rawPayload === "string"
        ? rawPayload
        : rawPayload instanceof Buffer
          ? rawPayload.toString("utf8")
          : Array.isArray(rawPayload)
            ? Buffer.concat(rawPayload).toString("utf8")
            : rawPayload instanceof ArrayBuffer
              ? Buffer.from(rawPayload).toString("utf8")
              : Buffer.from(
                  rawPayload.buffer,
                  rawPayload.byteOffset,
                  rawPayload.byteLength
                ).toString("utf8");
    if (payload.length === 0) {
      return;
    }

    const message = JSON.parse(payload) as SyncoreDevtoolsMessage;
    lastSnapshotMessageAt = Date.now();
    if (message.type === "hello") {
      hellos.set(message.runtimeId, message);
      return;
    }
    if (message.type === "event") {
      events.unshift(message.event);
      events.splice(200);
      if (message.event.type === "runtime.disconnected") {
        hellos.delete(message.event.runtimeId);
      }
      for (const listener of eventListeners) {
        listener(message.event);
      }
      return;
    }
    if (message.type === "command.result") {
      const resolver = commandResolvers.get(message.commandId);
      if (!resolver) {
        return;
      }
      commandResolvers.delete(message.commandId);
      resolver.resolve(message.payload);
      return;
    }
    if (message.type === "subscription.data") {
      subscriptionHandlers.get(message.subscriptionId)?.onData(message.payload);
      return;
    }
    if (message.type === "subscription.error") {
      subscriptionHandlers.get(message.subscriptionId)?.onError?.(message.error);
    }
  });

  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", (error) => reject(error));
  });

  const dispose = async () => {
    for (const [commandId, resolver] of commandResolvers) {
      commandResolvers.delete(commandId);
      resolver.reject(new Error("Syncore devtools hub disconnected."));
    }
    subscriptionHandlers.clear();

    if (socket.readyState === WebSocket.CLOSED) {
      return;
    }

    await new Promise<void>((resolve) => {
      socket.once("close", () => resolve());
      socket.close();
    });
  };

  return {
    async collectSnapshot(timeoutMs = 500) {
      const deadline = Date.now() + timeoutMs;
      let lastObservedMessageAt = lastSnapshotMessageAt;

      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 40));
        const sawClientHello = [...hellos.keys()].some(
          (runtimeId) => runtimeId !== "syncore-dev-hub"
        );
        if (!sawClientHello) {
          lastObservedMessageAt = lastSnapshotMessageAt;
          continue;
        }
        if (lastSnapshotMessageAt === lastObservedMessageAt) {
          break;
        }
        lastObservedMessageAt = lastSnapshotMessageAt;
      }
      return {
        hellos: [...hellos.values()],
        events: [...events]
      };
    },
    listRuntimeHellos() {
      return [...hellos.values()];
    },
    onEvent(listener) {
      eventListeners.add(listener);
      return () => {
        eventListeners.delete(listener);
      };
    },
    async sendCommand(runtimeId, payload) {
      const commandId = createHubRequestId("command");
      const result = await new Promise<SyncoreDevtoolsCommandResultPayload>(
        (resolve, reject) => {
          commandResolvers.set(commandId, { resolve, reject });
          socket.send(
            JSON.stringify({
              type: "command",
              commandId,
              targetRuntimeId: runtimeId,
              payload
            } satisfies SyncoreDevtoolsClientMessage)
          );
        }
      );
      return result;
    },
    subscribe(runtimeId, payload, handlers) {
      const subscriptionId = createHubRequestId("subscription");
      subscriptionHandlers.set(subscriptionId, handlers);
      socket.send(
        JSON.stringify({
          type: "subscribe",
          subscriptionId,
          targetRuntimeId: runtimeId,
          payload
        } satisfies SyncoreDevtoolsClientMessage)
      );
      return () => {
        if (!subscriptionHandlers.has(subscriptionId)) {
          return;
        }
        subscriptionHandlers.delete(subscriptionId);
        socket.send(
          JSON.stringify({
            type: "unsubscribe",
            subscriptionId,
            targetRuntimeId: runtimeId
          } satisfies SyncoreDevtoolsClientMessage)
        );
      };
    },
    dispose
  };
}

function buildClientTargets(hellos: RuntimeHello[]): ClientTargetDescriptor[] {
  const groups = new Map<
    string,
    {
      key: string;
      runtimes: RuntimeHello[];
    }
  >();

  for (const hello of hellos) {
    if (hello.runtimeId === "syncore-dev-hub") {
      continue;
    }
    const key = hello.storageIdentity ?? `runtime::${hello.runtimeId}`;
    const group = groups.get(key) ?? { key, runtimes: [] };
    group.runtimes.push(hello);
    groups.set(key, group);
  }

  const allRuntimeIds = hellos
    .filter((hello) => hello.runtimeId !== "syncore-dev-hub")
    .map((hello) => hello.runtimeId)
    .sort();

  return [...groups.values()]
    .map(({ key, runtimes }) => {
      const sortedRuntimes = [...runtimes].sort((left, right) =>
        left.runtimeId.localeCompare(right.runtimeId)
      );
      const primary = sortedRuntimes[0]!;
      const sessionLabels = Array.from(
        new Set(
          sortedRuntimes
            .map((entry) => entry.sessionLabel)
            .filter((value): value is string => typeof value === "string")
        )
      );
      const runtimeIds = sortedRuntimes.map((entry) => entry.runtimeId);
      const runtimeDescriptors = sortedRuntimes.map((entry, index) => ({
        id: createPublicRuntimeId(entry.runtimeId, allRuntimeIds),
        runtimeId: entry.runtimeId,
        label: getClientRuntimeLabel({
          ...(entry.sessionLabel ? { sessionLabel: entry.sessionLabel } : {}),
          ...(entry.appName ? { appName: entry.appName } : {}),
          platform: entry.platform
        }),
        platform: entry.platform,
        ...(entry.appName ? { appName: entry.appName } : {}),
        ...(entry.origin ? { origin: entry.origin } : {}),
        ...(entry.sessionLabel ? { sessionLabel: entry.sessionLabel } : {}),
        ...(entry.storageIdentity
          ? { storageIdentity: entry.storageIdentity }
          : {}),
        online: true as const,
        primary: index === 0
      }));
      return {
        id: createPublicClientTargetId(key, groups),
        kind: "client" as const,
        label: renderClientTargetLabel(primary, runtimes.length),
        runtimeId: primary.runtimeId,
        runtimeIds,
        runtimes: runtimeDescriptors,
        platform: primary.platform,
        ...(primary.appName ? { appName: primary.appName } : {}),
        ...(primary.origin ? { origin: primary.origin } : {}),
        sessionLabels,
        ...(primary.storageProtocol
          ? { storageProtocol: primary.storageProtocol }
          : {}),
        ...(primary.databaseLabel ? { databaseLabel: primary.databaseLabel } : {}),
        ...(primary.storageIdentity
          ? { storageIdentity: primary.storageIdentity }
          : {}),
        connectedSessions: runtimes.length,
        online: true as const,
        capabilities: [...CLIENT_TARGET_CAPABILITIES]
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function createPublicClientTargetId(
  key: string,
  groupsOrKeys: Map<string, { key: string; runtimes: RuntimeHello[] }> | Iterable<string>
): string {
  const keys =
    groupsOrKeys instanceof Map ? [...groupsOrKeys.keys()] : [...groupsOrKeys];
  return createSharedPublicTargetId(key, keys);
}

export function targetSupportsCapability(
  target: SyncoreTargetDescriptor,
  capability: TargetCapability
): boolean {
  return target.capabilities.includes(capability);
}

function renderClientTargetLabel(
  hello: RuntimeHello,
  connectedSessions: number
): string {
  const base =
    hello.appName ??
    hello.databaseLabel ??
    hello.origin ??
    `${hello.platform} client`;
  return connectedSessions > 1 ? `${base} (${connectedSessions} sessions)` : base;
}

export function createBasePublicClientTargetId(input: string): string {
  return createBasePublicId(input);
}

function createHubRequestId(prefix: string): string {
  return `syncore-cli-${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}
