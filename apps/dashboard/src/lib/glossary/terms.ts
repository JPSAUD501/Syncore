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
  | "sql"
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
      "Onde os dados deste data source são realmente persistidos (OPFS, IndexedDB ou arquivo).",
    docSlug: "storage-protocols",
    category: "storage"
  },
  "storage.opfs": {
    slug: "storage.opfs",
    title: "opfs",
    short:
      "Origin Private File System — um banco de dados em arquivo, privado do domínio no navegador.",
    docSlug: "storage-protocols",
    category: "storage"
  },
  "storage.indexeddb": {
    slug: "storage.indexeddb",
    title: "indexeddb",
    short: "IndexedDB — o armazenamento de documentos nativo do navegador.",
    docSlug: "storage-protocols",
    category: "storage"
  },
  "storage.idb": {
    slug: "storage.idb",
    title: "idb",
    short: "Apelido antigo (wire) para IndexedDB, normalizado na exibição.",
    docSlug: "storage-protocols",
    category: "storage"
  },
  "storage.file": {
    slug: "storage.file",
    title: "file",
    short: "Um banco de dados em arquivo no disco, usado por Node e Electron.",
    docSlug: "storage-protocols",
    category: "storage"
  },
  "storage.database-label": {
    slug: "storage.database-label",
    title: "Database",
    short:
      "Um data source é o armazenamento lógico compartilhado por runtimes. O rótulo db= é o nome do banco nele.",
    docSlug: "storage-protocols",
    category: "storage"
  },
  "storage.public-id": {
    slug: "storage.public-id",
    title: "Data Source id",
    short:
      "Um data source é o armazenamento lógico de um ou mais runtimes. Este id identifica esse data source de forma estável.",
    docSlug: "storage-protocols",
    category: "storage"
  },
  "storage.metadata-incomplete": {
    slug: "storage.metadata-incomplete",
    title: "Storage metadata incomplete",
    short:
      "O runtime não anunciou metadados completos; alguns campos podem estar ausentes.",
    docSlug: "storage-protocols",
    category: "storage"
  },

  // ── Runtime & targets ────────────────────────────────────────────────
  "runtime.platform": {
    slug: "runtime.platform",
    title: "Platform",
    short:
      "Um runtime é uma instância viva do seu app. A plataforma é o ambiente onde ele roda.",
    docSlug: "runtime-and-targets",
    category: "runtime"
  },
  "platform.browser-worker": {
    slug: "platform.browser-worker",
    title: "browser-worker",
    short: "Um runtime rodando dentro de um Web Worker, no navegador.",
    docSlug: "runtime-and-targets",
    category: "runtime"
  },
  "platform.browser": {
    slug: "platform.browser",
    title: "browser",
    short: "Um runtime rodando na thread principal do navegador.",
    docSlug: "runtime-and-targets",
    category: "runtime"
  },
  "platform.node": {
    slug: "platform.node",
    title: "node",
    short: "Um runtime rodando em Node.js (servidor, CLI, script).",
    docSlug: "runtime-and-targets",
    category: "runtime"
  },
  "platform.electron-main": {
    slug: "platform.electron-main",
    title: "electron-main",
    short: "Um runtime rodando no processo principal do Electron.",
    docSlug: "runtime-and-targets",
    category: "runtime"
  },
  "runtime.session": {
    slug: "runtime.session",
    title: "Runtime session",
    short:
      "Um runtime é uma instância viva do seu app conectada ao hub. O rótulo da sessão a identifica.",
    docSlug: "runtime-and-targets",
    category: "runtime"
  },
  "runtime.public-id": {
    slug: "runtime.public-id",
    title: "Runtime id",
    short:
      "Um runtime é uma instância viva do seu app conectada ao hub. Este id identifica esse runtime de forma estável.",
    docSlug: "runtime-and-targets",
    category: "runtime"
  },
  "runtime.browser": {
    slug: "runtime.browser",
    title: "Browser",
    short: "A família de navegador/host do runtime, lida do rótulo da sessão.",
    docSlug: "runtime-and-targets",
    category: "runtime"
  },
  "runtime.connection": {
    slug: "runtime.connection",
    title: "Connection",
    short:
      "Se este runtime está conectado ao hub agora. Comandos só rodam em runtimes conectados.",
    docSlug: "runtime-and-targets",
    category: "runtime"
  },
  "target.data-source": {
    slug: "target.data-source",
    title: "Data source",
    short:
      "O alvo de armazenamento lógico que um ou mais runtimes compartilham.",
    docSlug: "runtime-and-targets",
    category: "runtime"
  },
  "target.kind-client": {
    slug: "target.kind-client",
    title: "Client target",
    short:
      "Um alvo de cliente por runtime (mostrado como T<id>), escopado àquele runtime.",
    docSlug: "runtime-and-targets",
    category: "runtime"
  },
  "target.kind-project": {
    slug: "target.kind-project",
    title: "Project target",
    short:
      "Um alvo de projeto compartilhado que todos os runtimes do data source podem usar.",
    docSlug: "runtime-and-targets",
    category: "runtime"
  },
  "runtime.role-app": {
    slug: "runtime.role-app",
    title: "app",
    short: "Um runtime executando o código do seu aplicativo.",
    docSlug: "runtime-and-targets",
    category: "runtime"
  },
  "runtime.role-project-target": {
    slug: "runtime.role-project-target",
    title: "project-target",
    short:
      "Um runtime que hospeda o alvo de projeto compartilhado (administrativo).",
    docSlug: "runtime-and-targets",
    category: "runtime"
  },
  "runtime.project-target": {
    slug: "runtime.project-target",
    title: "Project",
    short:
      "Runtime do Project Target: o runtime administrativo local que detém o armazenamento canônico.",
    docSlug: "runtime-and-targets",
    category: "runtime"
  },
  "runtime.executor": {
    slug: "runtime.executor",
    title: "Executor",
    short:
      "O runtime pelo qual os comandos rodam enquanto “All runtimes” está selecionado.",
    docSlug: "runtime-and-targets",
    category: "runtime"
  },
  "runtime.all-runtimes": {
    slug: "runtime.all-runtimes",
    title: "All runtimes",
    short:
      "Mostra atividade de todos os runtimes conectados a este data source.",
    docSlug: "runtime-and-targets",
    category: "runtime"
  },
  "target.sql": {
    slug: "target.sql",
    title: "SQL",
    short: "Este runtime suporta comandos de leitura do SQL Console.",
    docSlug: "sql-console",
    category: "runtime"
  },

  // ── Reactivity: change reasons & invalidate scope ────────────────────
  "change.commit": {
    slug: "change.commit",
    title: "commit",
    short: "Uma transação foi confirmada, alterando documentos.",
    docSlug: "change-reasons",
    category: "reactivity"
  },
  "change.storage-put": {
    slug: "change.storage-put",
    title: "storage-put",
    short: "Um item do armazenamento (key/value) foi gravado.",
    docSlug: "change-reasons",
    category: "reactivity"
  },
  "change.storage-delete": {
    slug: "change.storage-delete",
    title: "storage-delete",
    short: "Um item do armazenamento (key/value) foi removido.",
    docSlug: "change-reasons",
    category: "reactivity"
  },
  "change.reconcile": {
    slug: "change.reconcile",
    title: "reconcile",
    short: "O cache local foi reconciliado com o armazenamento autoritativo.",
    docSlug: "change-reasons",
    category: "reactivity"
  },
  "invalidate.scope-database": {
    slug: "invalidate.scope-database",
    title: "scope: database",
    short: "A invalidação afeta apenas o banco de documentos.",
    docSlug: "change-reasons",
    category: "reactivity"
  },
  "invalidate.scope-storage": {
    slug: "invalidate.scope-storage",
    title: "scope: storage",
    short: "A invalidação afeta apenas o armazenamento key/value.",
    docSlug: "change-reasons",
    category: "reactivity"
  },
  "invalidate.scope-all": {
    slug: "invalidate.scope-all",
    title: "scope: all",
    short: "A invalidação afeta banco de dados e armazenamento.",
    docSlug: "change-reasons",
    category: "reactivity"
  },

  // ── Function types & registration ────────────────────────────────────
  "fn.query": {
    slug: "fn.query",
    title: "Query",
    short: "Uma função de leitura que retorna dados e permanece reativa.",
    docSlug: "function-types",
    category: "functions"
  },
  "fn.mutation": {
    slug: "fn.mutation",
    title: "Mutation",
    short: "Uma função de escrita que altera documentos numa transação.",
    docSlug: "function-types",
    category: "functions"
  },
  "fn.action": {
    slug: "fn.action",
    title: "Action",
    short:
      "Uma função com efeitos colaterais (rede, fs) que roda fora de uma transação.",
    docSlug: "function-types",
    category: "functions"
  },
  "fn.cron": {
    slug: "fn.cron",
    title: "Cron",
    short: "Uma função agendada para rodar de forma recorrente.",
    docSlug: "function-types",
    category: "functions"
  },
  "fn.registered": {
    slug: "fn.registered",
    title: "registered",
    short: "Descoberta a partir do esquema/registro como uma função conhecida.",
    docSlug: "function-types",
    category: "functions"
  },
  "fn.observed-only": {
    slug: "fn.observed-only",
    title: "observed only",
    short: " vista em runtime, mas não registrada formalmente no esquema.",
    docSlug: "function-types",
    category: "functions"
  },
  "fn.consumers": {
    slug: "fn.consumers",
    title: "Consumers",
    short: "Funções e componentes que chamam esta função.",
    docSlug: "function-types",
    category: "functions"
  },
  "fn.dependencies": {
    slug: "fn.dependencies",
    title: "Dependencies",
    short: "Outras funções que esta função chama.",
    docSlug: "function-types",
    category: "functions"
  },
  "fn.active-queries": {
    slug: "fn.active-queries",
    title: "Active queries",
    short:
      "Assinaturas de query ativas que referenciam esta função agora mesmo.",
    docSlug: "function-types",
    category: "functions"
  },
  "fn.reference": {
    slug: "fn.reference",
    title: "Function reference",
    short: "O identificador tipado e serializável usado para invocar a função.",
    docSlug: "function-types",
    category: "functions"
  },

  // ── Schema & documents ───────────────────────────────────────────────
  "schema.owner-root": {
    slug: "schema.owner-root",
    title: "owner: root",
    short: "Este campo/store pertence ao escopo raiz, compartilhado pelo app.",
    docSlug: "schema-ownership",
    category: "schema"
  },
  "schema.owner-component": {
    slug: "schema.owner-component",
    title: "owner: component",
    short: "Este campo/store pertence ao escopo de um componente instalado.",
    docSlug: "schema-ownership",
    category: "schema"
  },
  "schema.field-kind": {
    slug: "schema.field-kind",
    title: "Field kind",
    short: "O tipo inferido do valor do campo (string, number, date, …).",
    docSlug: "schema-ownership",
    category: "schema"
  },
  "schema.reference": {
    slug: "schema.reference",
    title: "Reference",
    short: "Uma chave estrangeira para um documento em outra tabela.",
    docSlug: "schema-ownership",
    category: "schema"
  },
  "schema.reference-missing": {
    slug: "schema.reference-missing",
    title: "missing",
    short: "O documento referenciado não existe (referência quebrada).",
    docSlug: "schema-ownership",
    category: "schema"
  },
  "schema.indexes": {
    slug: "schema.indexes",
    title: "Indexes",
    short: "Campos indexados que aceleram as consultas desta tabela.",
    docSlug: "schema-ownership",
    category: "schema"
  },

  // ── Operations ───────────────────────────────────────────────────────
  "op.insert": {
    slug: "op.insert",
    title: "insert",
    short: "Uma operação de mutação que cria um novo documento.",
    docSlug: "operations",
    category: "operations"
  },
  "op.patch": {
    slug: "op.patch",
    title: "patch",
    short: "Uma operação de mutação que atualiza parte de um documento.",
    docSlug: "operations",
    category: "operations"
  },
  "op.replace": {
    slug: "op.replace",
    title: "replace",
    short: "Uma operação de mutação que substitui um documento inteiro.",
    docSlug: "operations",
    category: "operations"
  },
  "op.mut-delete": {
    slug: "op.mut-delete",
    title: "delete",
    short: "Uma operação de mutação que remove um documento.",
    docSlug: "operations",
    category: "operations"
  },
  "op.put": {
    slug: "op.put",
    title: "put",
    short: "Uma operação de armazenamento que grava um item key/value.",
    docSlug: "operations",
    category: "operations"
  },
  "op.storage-delete": {
    slug: "op.storage-delete",
    title: "delete",
    short: "Uma operação de armazenamento que remove um item key/value.",
    docSlug: "operations",
    category: "operations"
  },

  // ── Scheduler ────────────────────────────────────────────────────────
  "scheduler.cron": {
    slug: "scheduler.cron",
    title: "Cron",
    short: "Uma função agendada que roda de forma recorrente.",
    docSlug: "scheduler",
    category: "scheduler"
  },
  "scheduler.schedule": {
    slug: "scheduler.schedule",
    title: "Schedule",
    short: "A cadência (intervalo ou expressão cron) em que o job roda.",
    docSlug: "scheduler",
    category: "scheduler"
  },
  "scheduler.status": {
    slug: "scheduler.status",
    title: "Status",
    short: "Estado atual do job (active, paused, due, error).",
    docSlug: "scheduler",
    category: "scheduler"
  },
  "scheduler.next-run": {
    slug: "scheduler.next-run",
    title: "Next run",
    short: "Quando o job está agendado para rodar em seguida.",
    docSlug: "scheduler",
    category: "scheduler"
  },
  "scheduler.last-run": {
    slug: "scheduler.last-run",
    title: "Last run",
    short: "Quando o job executou pela última vez.",
    docSlug: "scheduler",
    category: "scheduler"
  },
  "scheduler.cron-expression": {
    slug: "scheduler.cron-expression",
    title: "Cron expression",
    short: "Uma expressão de 5 campos que descreve quando o job roda.",
    docSlug: "scheduler",
    category: "scheduler"
  },

  // ── Queries ──────────────────────────────────────────────────────────
  "query.status-running": {
    slug: "query.status-running",
    title: "running",
    short: "A consulta está em execução no momento.",
    docSlug: "queries",
    category: "queries"
  },
  "query.status-done": {
    slug: "query.status-done",
    title: "done",
    short: "A consulta foi concluída com sucesso.",
    docSlug: "queries",
    category: "queries"
  },
  "query.status-error": {
    slug: "query.status-error",
    title: "error",
    short: "A consulta falhou durante a execução.",
    docSlug: "queries",
    category: "queries"
  },
  "query.status-cancelled": {
    slug: "query.status-cancelled",
    title: "cancelled",
    short: "A consulta foi cancelada antes de concluir.",
    docSlug: "queries",
    category: "queries"
  },
  "query.duration": {
    slug: "query.duration",
    title: "Duration",
    short: "Quanto tempo a consulta levou para executar.",
    docSlug: "queries",
    category: "queries"
  },
  "query.rows": {
    slug: "query.rows",
    title: "Rows",
    short: "Número de linhas/documentos retornados pela consulta.",
    docSlug: "queries",
    category: "queries"
  },

  // ── Logs ─────────────────────────────────────────────────────────────
  "logs.level": {
    slug: "logs.level",
    title: "Level",
    short: "Severidade de uma entrada de log (error, warn, info, …).",
    docSlug: "logs",
    category: "logs"
  },
  "logs.scope": {
    slug: "logs.scope",
    title: "Scope",
    short: "O componente ou função de onde a entrada de log se originou.",
    docSlug: "logs",
    category: "logs"
  },

  // ── SQL Console ──────────────────────────────────────────────────────
  "sql.rows-affected": {
    slug: "sql.rows-affected",
    title: "Rows affected",
    short: "Número de linhas alteradas pelo último comando executado.",
    docSlug: "sql-console",
    category: "sql"
  },
  "sql.execution-time": {
    slug: "sql.execution-time",
    title: "Execution time",
    short: "Quanto tempo o comando levou para executar.",
    docSlug: "sql-console",
    category: "sql"
  },

  // ── Traces ───────────────────────────────────────────────────────────
  "traces.span": {
    slug: "traces.span",
    title: "Span",
    short: "Uma unidade de trabalho cronometrada dentro de um trace.",
    docSlug: "traces",
    category: "traces"
  },
  "traces.duration": {
    slug: "traces.duration",
    title: "Duration",
    short: "Tempo de relógio do span, incluindo seus filhos.",
    docSlug: "traces",
    category: "traces"
  },
  "traces.children": {
    slug: "traces.children",
    title: "Children",
    short: "Spans aninhados disparados dentro deste span.",
    docSlug: "traces",
    category: "traces"
  },
  "traces.origin": {
    slug: "traces.origin",
    title: "Origin",
    short: "O runtime/documento de onde o span se originou.",
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
    title: "Storage protocols",
    description:
      "Como o Syncore persiste dados entre runtimes de navegador, Node e Electron."
  },
  {
    category: "runtime",
    title: "Runtime & targets",
    description:
      "Plataformas, sessões, data sources e a diferença entre alvos de cliente e de projeto."
  },
  {
    category: "reactivity",
    title: "Reactivity & invalidation",
    description: "Por que os caches mudam e como a invalidação é escopada."
  },
  {
    category: "functions",
    title: "Functions",
    description:
      "Funções query, mutation, action e cron, e seu ciclo de vida."
  },
  {
    category: "schema",
    title: "Schema & documents",
    description: "Posse, tipos de campo, referências e índices."
  },
  {
    category: "operations",
    title: "Operations",
    description:
      "Os códigos de operação de mutação e armazenamento mostrados nos logs de mudança."
  },
  {
    category: "scheduler",
    title: "Scheduler",
    description: "Jobs cron, agendamentos e status de execução."
  },
  {
    category: "queries",
    title: "Active queries",
    description: "Status, duração e métricas de resultado das queries ativas."
  },
  {
    category: "logs",
    title: "Logs",
    description: "Níveis e escopos de log."
  },
  {
    category: "sql",
    title: "SQL Console",
    description: "Executando SQL no runtime conectado."
  },
  {
    category: "traces",
    title: "Traces",
    description: "Spans, duração e origens em um trace."
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
