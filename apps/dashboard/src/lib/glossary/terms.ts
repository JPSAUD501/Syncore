/**
 * Glossary registry for the dashboard.
 *
 * Every opaque term shown in the UI that has a documentation page is registered
 * here. `slug` is the identifier passed to `<InfoTooltip termSlug="…" />`;
 * `docSlug` is the page under `src/content/docs/<docSlug>.md` that the
 * "Learn more" button opens (in the docs modal). The test `glossary.test.ts`
 * enforces that every `docSlug` referenced here resolves to an existing doc.
 *
 * Writing convention for `short`: explain the **concept** first, then the
 * specific label/id the user is hovering over. Keep it to one or two tight
 * lines — the full explanation lives in the linked document.
 *
 * Add new terms here — never hardcode glossary strings inside components.
 */

export type GlossaryCategory =
  | "storage"
  | "runtime"
  | "reactivity"
  | "functions"
  | "schema"
  | "operations"
  | "scheduler"
  | "queries"
  | "logs"
  | "traces";

export interface GlossaryTerm {
  /** Stable identifier referenced via `termSlug`. */
  slug: string;
  /** Heading shown in the hover card (usually the literal UI label). */
  title: string;
  /** One- or two-line explanation shown in the hover card body. */
  short: string;
  /** Document slug under `src/content/docs/` opened by "Learn more". */
  docSlug: string;
  /** Logical group, used by the docs hub index. */
  category: GlossaryCategory;
}

export const GLOSSARY: Record<string, GlossaryTerm> = {
  // ── Storage protocols ────────────────────────────────────────────────
  "storage.protocol": {
    slug: "storage.protocol",
    title: "Storage protocol",
    short:
      "Where this data source's data is actually persisted (OPFS, IndexedDB, or file).",
    docSlug: "storage-protocols",
    category: "storage"
  },
  "storage.opfs": {
    slug: "storage.opfs",
    title: "opfs",
    short:
      "Origin Private File System — a domain-private, file-backed database in the browser.",
    docSlug: "storage-protocols",
    category: "storage"
  },
  "storage.indexeddb": {
    slug: "storage.indexeddb",
    title: "indexeddb",
    short: "IndexedDB — the browser's native document store.",
    docSlug: "storage-protocols",
    category: "storage"
  },
  "storage.file": {
    slug: "storage.file",
    title: "file",
    short: "A file-backed database on disk, used by Node and Electron.",
    docSlug: "storage-protocols",
    category: "storage"
  },
  "storage.database-label": {
    slug: "storage.database-label",
    title: "Database",
    short:
      "A data source is the logical storage shared by runtimes. The db= label is the database name in it.",
    docSlug: "storage-protocols",
    category: "storage"
  },
  "storage.public-id": {
    slug: "storage.public-id",
    title: "Data Source id",
    short:
      "A data source is the logical storage of one or more runtimes. This id identifies this data source stably.",
    docSlug: "storage-protocols",
    category: "storage"
  },
  "storage.metadata-incomplete": {
    slug: "storage.metadata-incomplete",
    title: "Storage metadata incomplete",
    short:
      "The runtime has not announced full metadata; some fields may be missing.",
    docSlug: "storage-protocols",
    category: "storage"
  },

  // ── Runtime & targets ────────────────────────────────────────────────
  "runtime.platform": {
    slug: "runtime.platform",
    title: "Platform",
    short:
      "A runtime is a live instance of your app. The platform is the environment where it runs.",
    docSlug: "runtime-and-targets",
    category: "runtime"
  },
  "platform.browser-worker": {
    slug: "platform.browser-worker",
    title: "browser-worker",
    short: "A runtime running inside a Web Worker, in the browser.",
    docSlug: "runtime-and-targets",
    category: "runtime"
  },
  "platform.browser": {
    slug: "platform.browser",
    title: "browser",
    short: "A runtime running on the main browser thread.",
    docSlug: "runtime-and-targets",
    category: "runtime"
  },
  "platform.node": {
    slug: "platform.node",
    title: "node",
    short: "A runtime running in Node.js (server, CLI, script).",
    docSlug: "runtime-and-targets",
    category: "runtime"
  },
  "platform.electron-main": {
    slug: "platform.electron-main",
    title: "electron-main",
    short: "A runtime running in the Electron main process.",
    docSlug: "runtime-and-targets",
    category: "runtime"
  },
  "runtime.session": {
    slug: "runtime.session",
    title: "Runtime session",
    short:
      "A runtime is a live instance of your app connected to the hub. The session label identifies it.",
    docSlug: "runtime-and-targets",
    category: "runtime"
  },
  "runtime.public-id": {
    slug: "runtime.public-id",
    title: "Runtime id",
    short:
      "A runtime is a live instance of your app connected to the hub. This id identifies this runtime stably.",
    docSlug: "runtime-and-targets",
    category: "runtime"
  },
  "runtime.browser": {
    slug: "runtime.browser",
    title: "Browser",
    short: "The browser/host family of the runtime, parsed from the session label.",
    docSlug: "runtime-and-targets",
    category: "runtime"
  },
  "runtime.connection": {
    slug: "runtime.connection",
    title: "Connection",
    short:
      "Whether this runtime is connected to the hub right now. Commands only run on connected runtimes.",
    docSlug: "runtime-and-targets",
    category: "runtime"
  },
  "target.data-source": {
    slug: "target.data-source",
    title: "Data source",
    short:
      "The logical storage target that one or more runtimes share.",
    docSlug: "runtime-and-targets",
    category: "runtime"
  },
  "target.kind-client": {
    slug: "target.kind-client",
    title: "Client target",
    short:
      "A per-runtime client target (shown as T<id>), scoped to that runtime.",
    docSlug: "runtime-and-targets",
    category: "runtime"
  },
  "target.kind-project": {
    slug: "target.kind-project",
    title: "Project target",
    short:
      "A shared project target that all runtimes on the data source can use.",
    docSlug: "runtime-and-targets",
    category: "runtime"
  },
  "runtime.role-app": {
    slug: "runtime.role-app",
    title: "app",
    short: "A runtime executing your application code.",
    docSlug: "runtime-and-targets",
    category: "runtime"
  },
  "runtime.role-project-target": {
    slug: "runtime.role-project-target",
    title: "project-target",
    short:
      "A runtime hosting the shared project target (administrative).",
    docSlug: "runtime-and-targets",
    category: "runtime"
  },
  "runtime.project-target": {
    slug: "runtime.project-target",
    title: "Project",
    short:
      "Project Target runtime: the local administrative runtime holding canonical storage.",
    docSlug: "runtime-and-targets",
    category: "runtime"
  },
  "runtime.executor": {
    slug: "runtime.executor",
    title: "Executor",
    short:
      "The runtime through which commands run while “All runtimes” is selected.",
    docSlug: "runtime-and-targets",
    category: "runtime"
  },
  "runtime.all-runtimes": {
    slug: "runtime.all-runtimes",
    title: "All runtimes",
    short:
      "Shows activity from all runtimes connected to this data source.",
    docSlug: "runtime-and-targets",
    category: "runtime"
  },
  // ── Reactivity: change reasons & invalidate scope ────────────────────
  "change.commit": {
    slug: "change.commit",
    title: "commit",
    short: "A transaction was committed, modifying documents.",
    docSlug: "change-reasons",
    category: "reactivity"
  },
  "change.storage-put": {
    slug: "change.storage-put",
    title: "storage-put",
    short: "A storage (key/value) item was written.",
    docSlug: "change-reasons",
    category: "reactivity"
  },
  "change.storage-delete": {
    slug: "change.storage-delete",
    title: "storage-delete",
    short: "A storage (key/value) item was removed.",
    docSlug: "change-reasons",
    category: "reactivity"
  },
  "change.reconcile": {
    slug: "change.reconcile",
    title: "reconcile",
    short: "The local cache was reconciled with authoritative storage.",
    docSlug: "change-reasons",
    category: "reactivity"
  },
  "invalidate.scope-database": {
    slug: "invalidate.scope-database",
    title: "scope: database",
    short: "Invalidation affects only the document database.",
    docSlug: "change-reasons",
    category: "reactivity"
  },
  "invalidate.scope-storage": {
    slug: "invalidate.scope-storage",
    title: "scope: storage",
    short: "Invalidation affects only the key/value storage.",
    docSlug: "change-reasons",
    category: "reactivity"
  },
  "invalidate.scope-all": {
    slug: "invalidate.scope-all",
    title: "scope: all",
    short: "Invalidation affects both database and storage.",
    docSlug: "change-reasons",
    category: "reactivity"
  },

  // ── Function types & registration ────────────────────────────────────
  "fn.query": {
    slug: "fn.query",
    title: "Query",
    short: "A read function that returns data and remains reactive.",
    docSlug: "function-types",
    category: "functions"
  },
  "fn.mutation": {
    slug: "fn.mutation",
    title: "Mutation",
    short: "A write function that modifies documents in a transaction.",
    docSlug: "function-types",
    category: "functions"
  },
  "fn.action": {
    slug: "fn.action",
    title: "Action",
    short:
      "A side-effecting function (network, fs) that runs outside a transaction.",
    docSlug: "function-types",
    category: "functions"
  },
  "fn.cron": {
    slug: "fn.cron",
    title: "Cron",
    short: "A scheduled function set to run on a recurring basis.",
    docSlug: "function-types",
    category: "functions"
  },
  "fn.registered": {
    slug: "fn.registered",
    title: "registered",
    short: "Discovered from the schema/registry as a known function.",
    docSlug: "function-types",
    category: "functions"
  },
  "fn.observed-only": {
    slug: "fn.observed-only",
    title: "observed only",
    short: "Seen at runtime but not formally registered in the schema.",
    docSlug: "function-types",
    category: "functions"
  },
  "fn.consumers": {
    slug: "fn.consumers",
    title: "Consumers",
    short: "Functions and components that call this function.",
    docSlug: "function-types",
    category: "functions"
  },
  "fn.dependencies": {
    slug: "fn.dependencies",
    title: "Dependencies",
    short: "Other functions that this function calls.",
    docSlug: "function-types",
    category: "functions"
  },
  "fn.active-queries": {
    slug: "fn.active-queries",
    title: "Active queries",
    short:
      "Active query subscriptions referencing this function right now.",
    docSlug: "function-types",
    category: "functions"
  },
  "fn.reference": {
    slug: "fn.reference",
    title: "Function reference",
    short: "The typed, serializable identifier used to invoke the function.",
    docSlug: "function-types",
    category: "functions"
  },

  // ── Schema & documents ───────────────────────────────────────────────
  "schema.owner-root": {
    slug: "schema.owner-root",
    title: "owner: root",
    short: "This field/store belongs to the root scope, shared by the app.",
    docSlug: "schema-ownership",
    category: "schema"
  },
  "schema.owner-component": {
    slug: "schema.owner-component",
    title: "owner: component",
    short: "This field/store belongs to an installed component's scope.",
    docSlug: "schema-ownership",
    category: "schema"
  },
  "schema.field-kind": {
    slug: "schema.field-kind",
    title: "Field kind",
    short: "The inferred type of the field value (string, number, date, …).",
    docSlug: "schema-ownership",
    category: "schema"
  },
  "schema.reference": {
    slug: "schema.reference",
    title: "Reference",
    short: "A foreign key to a document in another table.",
    docSlug: "schema-ownership",
    category: "schema"
  },
  "schema.reference-missing": {
    slug: "schema.reference-missing",
    title: "missing",
    short: "The referenced document does not exist (broken reference).",
    docSlug: "schema-ownership",
    category: "schema"
  },
  "schema.indexes": {
    slug: "schema.indexes",
    title: "Indexes",
    short: "Indexed fields that speed up queries on this table.",
    docSlug: "schema-ownership",
    category: "schema"
  },

  // ── Operations ───────────────────────────────────────────────────────
  "op.insert": {
    slug: "op.insert",
    title: "insert",
    short: "A mutation operation that creates a new document.",
    docSlug: "operations",
    category: "operations"
  },
  "op.patch": {
    slug: "op.patch",
    title: "patch",
    short: "A mutation operation that updates part of a document.",
    docSlug: "operations",
    category: "operations"
  },
  "op.replace": {
    slug: "op.replace",
    title: "replace",
    short: "A mutation operation that replaces an entire document.",
    docSlug: "operations",
    category: "operations"
  },
  "op.mut-delete": {
    slug: "op.mut-delete",
    title: "delete",
    short: "A mutation operation that removes a document.",
    docSlug: "operations",
    category: "operations"
  },
  "op.put": {
    slug: "op.put",
    title: "put",
    short: "A storage operation that writes a key/value item.",
    docSlug: "operations",
    category: "operations"
  },
  "op.storage-delete": {
    slug: "op.storage-delete",
    title: "delete",
    short: "A storage operation that removes a key/value item.",
    docSlug: "operations",
    category: "operations"
  },

  // ── Scheduler ────────────────────────────────────────────────────────
  "scheduler.cron": {
    slug: "scheduler.cron",
    title: "Cron",
    short: "A scheduled function that runs on a recurring basis.",
    docSlug: "scheduler",
    category: "scheduler"
  },
  "scheduler.schedule": {
    slug: "scheduler.schedule",
    title: "Schedule",
    short: "The cadence (interval or cron expression) at which the job runs.",
    docSlug: "scheduler",
    category: "scheduler"
  },
  "scheduler.status": {
    slug: "scheduler.status",
    title: "Status",
    short: "Current state of the job (active, paused, due, error).",
    docSlug: "scheduler",
    category: "scheduler"
  },
  "scheduler.next-run": {
    slug: "scheduler.next-run",
    title: "Next run",
    short: "When the job is scheduled to run next.",
    docSlug: "scheduler",
    category: "scheduler"
  },
  "scheduler.last-run": {
    slug: "scheduler.last-run",
    title: "Last run",
    short: "When the job executed last.",
    docSlug: "scheduler",
    category: "scheduler"
  },
  "scheduler.cron-expression": {
    slug: "scheduler.cron-expression",
    title: "Cron expression",
    short: "A 5-field expression describing when the job runs.",
    docSlug: "scheduler",
    category: "scheduler"
  },

  // ── Queries ──────────────────────────────────────────────────────────
  "query.status-running": {
    slug: "query.status-running",
    title: "running",
    short: "The query is currently executing.",
    docSlug: "queries",
    category: "queries"
  },
  "query.status-done": {
    slug: "query.status-done",
    title: "done",
    short: "The query completed successfully.",
    docSlug: "queries",
    category: "queries"
  },
  "query.status-error": {
    slug: "query.status-error",
    title: "error",
    short: "The query failed during execution.",
    docSlug: "queries",
    category: "queries"
  },
  "query.status-cancelled": {
    slug: "query.status-cancelled",
    title: "cancelled",
    short: "The query was cancelled before completion.",
    docSlug: "queries",
    category: "queries"
  },
  "query.duration": {
    slug: "query.duration",
    title: "Duration",
    short: "How long the query took to execute.",
    docSlug: "queries",
    category: "queries"
  },
  "query.rows": {
    slug: "query.rows",
    title: "Rows",
    short: "Number of rows/documents returned by the query.",
    docSlug: "queries",
    category: "queries"
  },

  // ── Logs ─────────────────────────────────────────────────────────────
  "logs.level": {
    slug: "logs.level",
    title: "Level",
    short: "Severity of a log entry (error, warn, info, …).",
    docSlug: "logs",
    category: "logs"
  },
  "logs.scope": {
    slug: "logs.scope",
    title: "Scope",
    short: "The component or function where the log entry originated.",
    docSlug: "logs",
    category: "logs"
  },

  // ── Traces ───────────────────────────────────────────────────────────
  "traces.span": {
    slug: "traces.span",
    title: "Span",
    short: "A unit of timed work within a trace.",
    docSlug: "traces",
    category: "traces"
  },
  "traces.duration": {
    slug: "traces.duration",
    title: "Duration",
    short: "Wall-clock time of the span, including its children.",
    docSlug: "traces",
    category: "traces"
  },
  "traces.children": {
    slug: "traces.children",
    title: "Children",
    short: "Nested spans triggered within this span.",
    docSlug: "traces",
    category: "traces"
  },
  "traces.origin": {
    slug: "traces.origin",
    title: "Origin",
    short: "The runtime/document where the span originated.",
    docSlug: "traces",
    category: "traces"
  }
};

export const GLOSSARY_CATEGORIES: {
  category: GlossaryCategory;
  title: string;
  description: string;
}[] = [
  {
    category: "storage",
    title: "Storage Protocols",
    description:
      "How Syncore persists data across browser, Node, and Electron runtimes."
  },
  {
    category: "runtime",
    title: "Runtime & Targets",
    description:
      "Platforms, sessions, data sources, and the difference between client and project targets."
  },
  {
    category: "reactivity",
    title: "Reactivity & Invalidation",
    description: "Why caches change and how invalidation is scoped."
  },
  {
    category: "functions",
    title: "Functions",
    description:
      "Query, mutation, action, and cron functions, and their lifecycle."
  },
  {
    category: "schema",
    title: "Schema & Documents",
    description: "Ownership, field types, references, and indexes."
  },
  {
    category: "operations",
    title: "Operations",
    description:
      "The mutation and storage opcodes shown in changelogs."
  },
  {
    category: "scheduler",
    title: "Scheduler",
    description: "Cron jobs, schedules, and execution status."
  },
  {
    category: "queries",
    title: "Active Queries",
    description: "Status, duration, and result metrics for active queries."
  },
  {
    category: "logs",
    title: "Logs",
    description: "Log levels and scopes."
  },
  {
    category: "traces",
    title: "Traces",
    description: "Spans, duration, and origins in a trace."
  }
];

/** Look up a glossary term by its slug. */
export function getTerm(slug: string): GlossaryTerm | undefined {
  return GLOSSARY[slug];
}

/** All terms, grouped by category (for the docs hub index). */
export function termsByCategory(): Record<GlossaryCategory, GlossaryTerm[]> {
  const grouped = {} as Record<GlossaryCategory, GlossaryTerm[]>;
  for (const cat of GLOSSARY_CATEGORIES) grouped[cat.category] = [];
  for (const term of Object.values(GLOSSARY)) {
    grouped[term.category]?.push(term);
  }
  return grouped;
}
