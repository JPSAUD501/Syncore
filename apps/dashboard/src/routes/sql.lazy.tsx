import { createLazyFileRoute } from "@tanstack/react-router";
import {
  Terminal,
  Play,
  Loader2,
  Clock,
  Trash2,
  ChevronRight,
  Table2,
  AlertCircle,
  History
} from "lucide-react";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { SQLite, sql as sqlLang } from "@codemirror/lang-sql";
import type { SQLNamespace } from "@codemirror/lang-sql";
import { EditorView } from "@codemirror/view";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared";
import { useConnection } from "@/hooks";
import { usePreferredTarget } from "@/hooks/usePreferredTarget";
import { useDevtoolsSubscription } from "@/hooks/useReactiveData";
import { sendRequest } from "@/lib/store";
import { stableStringify } from "@/lib/stable";
import {
  readJsonPreference,
  safeRemoveLocalStorage,
  SQL_HISTORY_STORAGE_KEY,
  writeJsonPreference
} from "@/lib/storage";
import { cn, formatDuration } from "@/lib/utils";
import type { TableSchema } from "@syncore/devtools-protocol";

export const Route = createLazyFileRoute("/sql")({
  component: SqlPage
});

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface QueryResult {
  columns: string[];
  rows: unknown[][];
  durationMs: number;
  mode: "read" | "write" | "live";
  rowsAffected?: number;
  observedTables?: string[];
  invalidationScopes?: string[];
  error?: string;
}

interface HistoryEntry {
  query: string;
  timestamp: number;
  durationMs: number;
  rowCount: number;
  mode: "read" | "write" | "live";
  error?: string;
}

type SqlMode = "read" | "write" | "live";

const PRAGMA_SHORTCUTS: Array<{ label: string; query: string; mode: SqlMode }> =
  [
    {
      label: "Table List",
      query: "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;",
      mode: "read"
    },
    {
      label: "Schema Info",
      query: "SELECT sql FROM sqlite_master WHERE type='table';",
      mode: "read"
    },
    {
      label: "Index List",
      query: "SELECT name, tbl_name FROM sqlite_master WHERE type='index';",
      mode: "read"
    },
    { label: "Page Count", query: "PRAGMA page_count;", mode: "read" },
    { label: "Page Size", query: "PRAGMA page_size;", mode: "read" },
    { label: "Journal Mode", query: "PRAGMA journal_mode;", mode: "read" },
    { label: "WAL Status", query: "PRAGMA wal_checkpoint;", mode: "read" },
    { label: "Foreign Keys", query: "PRAGMA foreign_keys;", mode: "read" },
    { label: "Integrity Check", query: "PRAGMA integrity_check;", mode: "read" }
  ];

function getModeUnavailableReason(mode: SqlMode, fallback: string): string {
  if (mode === "live") {
    return "SQL Live is not available for this data source.";
  }
  if (mode === "write") {
    return "SQL Write is not available for this data source.";
  }
  return fallback;
}

/* ------------------------------------------------------------------ */
/*  CodeMirror Substrate theme                                         */
/* ------------------------------------------------------------------ */

const substrateTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "var(--color-bg-deep)",
      color: "var(--color-text-code)",
      fontSize: "13px",
      fontFamily: "'Fira Code', 'JetBrains Mono', monospace"
    },
    ".cm-content": {
      caretColor: "var(--color-accent)",
      padding: "12px 0",
      lineHeight: "1.6"
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--color-accent)",
      borderLeftWidth: "2px"
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      {
        backgroundColor: "rgba(212, 168, 83, 0.15)"
      },
    ".cm-activeLine": {
      backgroundColor: "rgba(212, 168, 83, 0.05)"
    },
    ".cm-gutters": {
      backgroundColor: "var(--color-bg-base)",
      color: "var(--color-text-tertiary)",
      borderRight: "1px solid rgba(212, 168, 83, 0.08)",
      fontSize: "11px",
      minWidth: "40px"
    },
    ".cm-activeLineGutter": {
      backgroundColor: "rgba(212, 168, 83, 0.08)",
      color: "var(--color-text-secondary)"
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "var(--color-bg-elevated)",
      border: "none",
      color: "var(--color-text-tertiary)"
    },
    ".cm-tooltip": {
      backgroundColor: "var(--color-bg-elevated)",
      border: "1px solid rgba(212, 168, 83, 0.15)",
      borderRadius: "6px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
    },
    ".cm-tooltip-autocomplete": {
      "& > ul > li[aria-selected]": {
        backgroundColor: "rgba(212, 168, 83, 0.12)",
        color: "var(--color-text-primary)"
      }
    },
    "&.cm-focused": {
      outline: "none"
    }
  },
  { dark: true }
);

const substrateHighlight = EditorView.baseTheme({
  ".cm-keyword": { color: "#d4a853", fontWeight: "500" },
  ".cm-operator": { color: "#a69e90" },
  ".cm-string": { color: "#4ade80" },
  ".cm-number": { color: "#60a5fa" },
  ".cm-comment": { color: "#6b6459", fontStyle: "italic" },
  ".cm-typeName": { color: "#a78bfa" },
  ".cm-propertyName": { color: "#c4b898" },
  ".cm-punctuation": { color: "#6b6459" },
  ".cm-variableName": { color: "#e8e0d4" },
  ".cm-bool": { color: "#fbbf24" }
});

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

function SqlPage() {
  const { isReady } = useConnection();
  const {
    activeRuntime,
    targetRuntimeId,
    usingProjectTarget,
    selectedTarget,
    runtimeFilter
  } = usePreferredTarget();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SqlMode>("read");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    const parsed = readJsonPreference<unknown>(SQL_HISTORY_STORAGE_KEY, []);
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  });
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const sqlCapabilities = activeRuntime?.capabilities?.sql;
  const allRuntimesSelected =
    selectedTarget?.kind === "client" &&
    selectedTarget.runtimes.length > 1 &&
    runtimeFilter === "all";
  const sqlUnavailableReason =
    sqlCapabilities?.reason ??
    (allRuntimesSelected
      ? "SQL Console requires an executor runtime with SQL support. The current All runtimes executor does not provide SQL."
      : "SQL Console is not available for the selected runtime.");
  const canReadSql = sqlCapabilities?.read === true;
  const canWriteSql = canReadSql && sqlCapabilities?.write === true;
  const canLiveSql = canReadSql && sqlCapabilities?.live === true;
  const schemaSubscription = useDevtoolsSubscription(
    targetRuntimeId ? { kind: "schema.tables" } : null,
    {
      enabled: Boolean(targetRuntimeId),
      targetRuntimeId
    }
  );
  const schemaTables = useMemo(
    () =>
      schemaSubscription.data?.kind === "schema.tables.result"
        ? schemaSubscription.data.tables
        : [],
    [schemaSubscription.data]
  );
  const sqlSchema = useMemo(
    () => buildSqlCompletionSchema(schemaTables),
    [schemaTables]
  );

  /* ---------------------------------------------------------------- */
  /*  Persist history                                                  */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    writeJsonPreference(SQL_HISTORY_STORAGE_KEY, history.slice(0, 50));
  }, [history]);

  const liveStartedAtRef = useRef<number | null>(null);

  const liveSubscription = useDevtoolsSubscription(
    isReady && canLiveSql && mode === "live" && query.trim()
      ? { kind: "sql.watch", query: query.trim() }
      : null,
    {
      enabled:
        isReady && canLiveSql && mode === "live" && query.trim().length > 0,
      targetRuntimeId
    }
  );

  useEffect(() => {
    if (liveSubscription.data?.kind === "sql.watch.result") {
      setResult({
        columns: liveSubscription.data.columns,
        rows: liveSubscription.data.rows,
        durationMs:
          liveStartedAtRef.current === null
            ? 0
            : performance.now() - liveStartedAtRef.current,
        mode: "live",
        observedTables: liveSubscription.data.observedTables
      });
    }
  }, [liveSubscription.data]);

  /* ---------------------------------------------------------------- */
  /*  Execute query                                                    */
  /* ---------------------------------------------------------------- */

  const executeQuery = useCallback(
    async (sql?: string, modeOverride?: SqlMode) => {
      const queryText = sql ?? query.trim();
      const executionMode = modeOverride ?? mode;
      if (!queryText || !targetRuntimeId) return;
      if (!canReadSql) {
        setResult({
          columns: [],
          rows: [],
          durationMs: 0,
          mode: executionMode,
          error: sqlUnavailableReason
        });
        return;
      }
      if (executionMode === "live") {
        if (!canLiveSql) {
          setResult({
            columns: [],
            rows: [],
            durationMs: 0,
            mode: "live",
            error: "SQL Live is not available for this data source."
          });
        }
        return;
      }
      if (executionMode === "write" && !canWriteSql) {
        setResult({
          columns: [],
          rows: [],
          durationMs: 0,
          mode: "write",
          error: "SQL Write is not available for this data source."
        });
        return;
      }

      setLoading(true);
      const startTime = performance.now();

      try {
        const res = await sendRequest(
          {
            kind: executionMode === "write" ? "sql.write" : "sql.read",
            query: queryText
          },
          { targetRuntimeId }
        );
        const durationMs = performance.now() - startTime;

        if (res.kind === "sql.read.result") {
          const queryResult: QueryResult = {
            columns: res.columns,
            rows: res.rows,
            durationMs,
            mode: "read"
          };

          if (res.error) {
            queryResult.error = res.error;
          }

          setResult(queryResult);

          // Add to history
          const entry: HistoryEntry = {
            query: queryText,
            timestamp: Date.now(),
            durationMs,
            rowCount: res.rows.length,
            mode: "read"
          };
          if (res.error) entry.error = res.error;
          setHistory((prev) => [entry, ...prev.slice(0, 49)]);
        } else if (res.kind === "sql.write.result") {
          setResult({
            columns: [],
            rows: [],
            rowsAffected: res.rowsAffected,
            durationMs,
            mode: "write",
            invalidationScopes: res.invalidationScopes,
            ...(res.error ? { error: res.error } : {})
          });
          const entry: HistoryEntry = {
            query: queryText,
            timestamp: Date.now(),
            durationMs,
            rowCount: 0,
            mode: "write",
            ...(res.error ? { error: res.error } : {})
          };
          setHistory((prev) => [entry, ...prev.slice(0, 49)]);
        }
      } catch (err) {
        const durationMs = performance.now() - startTime;
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        setResult({
          columns: [],
          rows: [],
          durationMs,
          mode: executionMode,
          error: errorMsg
        });
      } finally {
        setLoading(false);
      }
    },
    [
      canLiveSql,
      canReadSql,
      canWriteSql,
      mode,
      query,
      sqlUnavailableReason,
      targetRuntimeId
    ]
  );

  useEffect(() => {
    if (mode !== "live") {
      liveStartedAtRef.current = null;
      setResult((prev) => (prev?.mode === "live" ? null : prev));
      return;
    }
    const queryText = query.trim();
    if (!isReady || !queryText || !canLiveSql) {
      liveStartedAtRef.current = null;
      setResult(null);
      return;
    }
    if (liveSubscription.loading) {
      setResult(null);
    }
    if (liveStartedAtRef.current === null) {
      liveStartedAtRef.current = performance.now();
    }
    setResult((prev) =>
      prev?.mode === "live"
        ? prev
        : {
            columns: [],
            rows: [],
            durationMs: 0,
            mode: "live"
          }
    );
    setLoading(liveSubscription.loading);
    if (liveSubscription.data?.kind === "sql.watch.result") {
      const liveRows = liveSubscription.data.rows;
      const durationMs =
        liveStartedAtRef.current === null
          ? 0
          : performance.now() - liveStartedAtRef.current;
      setHistory((prev) => {
        const nextEntry: HistoryEntry = {
          query: queryText,
          timestamp: Date.now(),
          durationMs,
          rowCount: liveRows.length,
          mode: "live"
        };
        if (prev[0]?.query === queryText && prev[0]?.mode === "live") {
          return [nextEntry, ...prev.slice(1, 49)];
        }
        return [nextEntry, ...prev.slice(0, 49)];
      });
    }
  }, [
    isReady,
    liveSubscription.data,
    liveSubscription.loading,
    canLiveSql,
    mode,
    query
  ]);

  /* ---------------------------------------------------------------- */
  /*  Clear history                                                    */
  /* ---------------------------------------------------------------- */

  const clearHistory = useCallback(() => {
    setHistory([]);
    safeRemoveLocalStorage(SQL_HISTORY_STORAGE_KEY);
  }, []);

  /* ---------------------------------------------------------------- */
  /*  CodeMirror extensions                                            */
  /* ---------------------------------------------------------------- */

  const extensions = useMemo(
    () => [
      sqlLang({
        dialect: SQLite,
        schema: sqlSchema,
        upperCaseKeywords: true
      }),
      substrateTheme,
      substrateHighlight,
      EditorView.lineWrapping,
      EditorView.domEventHandlers({
        keydown: (event: KeyboardEvent) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            void executeQuery();
            return true;
          }
          return false;
        }
      })
    ],
    [executeQuery, sqlSchema]
  );

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  if (selectedTarget && !canReadSql) {
    return (
      <div className="flex h-[calc(100vh-7rem)] items-center justify-center rounded-md border border-border bg-bg-surface">
        <EmptyState
          icon={Terminal}
          title="SQL Console unavailable"
          description={sqlUnavailableReason}
        />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-3">
      {/* ---- Main content ---- */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-bg-surface">
        {/* Editor area — enhanced with sql-editor-wrapper */}
        <div className="border-b border-border p-4">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="flex-1 text-[14px] font-semibold text-text-primary">
              Query
            </h2>
            {usingProjectTarget && (
              <Badge variant="outline" className="text-[9px]">
                Project Target
              </Badge>
            )}
            <Badge variant="outline" className="text-[9px]">
              SQLite
            </Badge>
          </div>

          <div className="sql-editor-wrapper">
            <CodeMirror
              ref={editorRef}
              value={query}
              onChange={setQuery}
              extensions={extensions}
              height="160px"
              placeholder={
                mode === "write"
                  ? 'UPDATE "tasks" SET _json = json_set(_json, "$.done", true) WHERE _id = "...";'
                  : 'SELECT * FROM "tasks" LIMIT 10;'
              }
              basicSetup={{
                lineNumbers: true,
                foldGutter: false,
                highlightActiveLine: true,
                highlightSelectionMatches: true,
                bracketMatching: true,
                closeBrackets: true,
                autocompletion: true,
                indentOnInput: true,
                tabSize: 2
              }}
            />
          </div>

          <div className="mt-3 flex items-center gap-2">
            {mode !== "live" && (
              <Button
                onClick={() => void executeQuery()}
                disabled={
                  !targetRuntimeId ||
                  loading ||
                  !query.trim() ||
                  (mode === "write" ? !canWriteSql : !canReadSql)
                }
                size="sm"
                className="gap-1.5 px-4"
              >
                {loading ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Play size={13} />
                )}
                {loading ? "Executing..." : mode === "write" ? "Write" : "Read"}
              </Button>
            )}

            <div className="flex items-center gap-1 rounded-md border border-border bg-bg-base p-0.5">
              {(["read", "live", "write"] as const).map((nextMode) => (
                <button
                  key={nextMode}
                  type="button"
                  disabled={
                    nextMode === "live"
                      ? !canLiveSql
                      : nextMode === "write"
                        ? !canWriteSql
                        : !canReadSql
                  }
                  onClick={() => setMode(nextMode)}
                  className={cn(
                    "rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
                    mode === nextMode
                      ? "bg-accent text-bg-deep"
                      : "text-text-tertiary hover:text-text-primary",
                    "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-text-tertiary"
                  )}
                >
                  {nextMode[0]!.toUpperCase() + nextMode.slice(1)}
                </button>
              ))}
            </div>

            <span className="text-[11px] text-text-tertiary hidden sm:block">
              {mode === "live" ? "Live updates enabled" : "Ctrl+Enter to run"}
            </span>

            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 lg:hidden"
              onClick={() => setMobileHistoryOpen(true)}
            >
              <History size={12} />
              History
            </Button>

            {result && !result.error && (
              <div className="ml-auto flex items-center gap-3 text-[11px] text-text-tertiary animate-fade-in">
                <span className="flex items-center gap-1">
                  <Table2 size={10} />
                  {result.rows.length} rows
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={10} />
                  {formatDuration(result.durationMs)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Results area */}
        <div className="flex min-h-0 flex-1 flex-col bg-bg-base">
          {mode === "live" && !canLiveSql ? (
            <div className="p-4 text-[12px] text-text-tertiary">
              {getModeUnavailableReason("live", sqlUnavailableReason)}
            </div>
          ) : mode === "live" && liveSubscription.loading && !result ? (
            <div className="p-4 text-[12px] text-text-tertiary">
              Subscribing...
            </div>
          ) : result ? (
            result.error ? (
              <div className="p-4 animate-fade-in">
                <div className="rounded-md border border-error/20 bg-error/5 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle size={14} className="text-error" />
                    <span className="text-[12px] font-medium text-error">
                      Query Error
                    </span>
                    <span className="text-[10px] text-text-tertiary ml-auto">
                      {formatDuration(result.durationMs)}
                    </span>
                  </div>
                  <pre className="text-[11px] text-error/90 font-mono whitespace-pre-wrap">
                    {result.error}
                  </pre>
                </div>
              </div>
            ) : (
              <ResultsTable result={result} />
            )
          ) : (
            <EmptyState
              icon={Terminal}
              title="Run a query"
              description="Use Read for one-off queries, Live for reactive readonly queries, and Write for mutations."
              className="h-full"
            />
          )}
        </div>
      </div>

      {/* ---- Right sidebar: schema, shortcuts, history ---- */}
      <div className="hidden w-80 shrink-0 overflow-hidden rounded-md border border-border bg-bg-surface lg:flex lg:flex-col">
        <SchemaBrowser
          tables={schemaTables}
          loading={schemaSubscription.loading}
          onSelectTable={(tableName) => {
            const nextQuery = `SELECT * FROM ${quoteSqlIdentifier(tableName)} LIMIT 50;`;
            setMode("read");
            setQuery(nextQuery);
          }}
        />

        <div className="border-b border-border p-3">
          <div className="mb-2 flex items-center gap-2">
            <Table2 size={12} className="text-accent" />
            <span className="text-[11px] font-semibold text-text-primary">
              Quick Actions
            </span>
          </div>
          <div className="space-y-0.5">
            {PRAGMA_SHORTCUTS.map((shortcut) => (
              <button
                key={shortcut.label}
                type="button"
                onClick={() => {
                  setMode(shortcut.mode);
                  setQuery(shortcut.query);
                  void executeQuery(shortcut.query, shortcut.mode);
                }}
                disabled={!targetRuntimeId || mode === "live"}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-[11px] text-text-secondary transition-colors",
                  "hover:bg-bg-base hover:text-text-primary",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                <ChevronRight size={10} className="text-text-tertiary" />
                {shortcut.label}
              </button>
            ))}
          </div>
        </div>

        {/* History */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center gap-2 border-b border-border p-3">
            <History size={12} className="text-text-tertiary" />
            <span className="flex-1 text-[11px] font-semibold text-text-primary">
              History
            </span>
            {history.length > 0 && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={clearHistory}
                title="Clear history"
              >
                <Trash2 size={10} />
              </Button>
            )}
          </div>

          <ScrollArea className="flex-1">
            <div className="p-1.5">
              {history.length === 0 ? (
                <p className="py-4 text-center text-[10px] text-text-tertiary">
                  No query history
                </p>
              ) : (
                history.map((entry, i) => (
                  <button
                    key={`${entry.timestamp}-${i}`}
                    type="button"
                    onClick={() => setQuery(entry.query)}
                    className={cn(
                      "group w-full rounded px-2 py-1.5 text-left transition-colors",
                      "hover:bg-bg-base"
                    )}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {entry.error ? (
                        <AlertCircle size={9} className="text-error shrink-0" />
                      ) : (
                        <Terminal
                          size={9}
                          className="text-text-tertiary shrink-0"
                        />
                      )}
                      <span className="text-[10px] text-text-tertiary">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="text-[9px] text-text-tertiary ml-auto">
                        {entry.rowCount}r / {formatDuration(entry.durationMs)}
                      </span>
                    </div>
                    <p className="text-[10px] text-text-secondary font-mono truncate group-hover:text-text-primary">
                      {entry.query}
                    </p>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Mobile: shortcuts + history dialog */}
      <Dialog open={mobileHistoryOpen} onOpenChange={setMobileHistoryOpen}>
        <DialogContent className="max-h-[85vh] overflow-hidden p-0 sm:max-w-sm">
          <DialogHeader className="border-b border-border px-4 py-3">
            <DialogTitle className="text-[14px]">
              Quick Actions & History
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh]">
            <div className="p-3">
              {/* Quick actions */}
              <p className="mb-2 text-[11px] font-semibold text-text-primary">
                Quick Actions
              </p>
              <div className="mb-4 space-y-0.5">
                {PRAGMA_SHORTCUTS.map((shortcut) => (
                  <button
                    key={shortcut.label}
                    type="button"
                    onClick={() => {
                      setMode(shortcut.mode);
                      setQuery(shortcut.query);
                      setMobileHistoryOpen(false);
                      void executeQuery(shortcut.query, shortcut.mode);
                    }}
                    disabled={!targetRuntimeId || mode === "live"}
                    className={cn(
                      "flex w-full items-center gap-2 rounded px-2 py-2 text-[12px] text-text-secondary transition-colors",
                      "hover:bg-bg-base hover:text-text-primary",
                      "disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                  >
                    <ChevronRight size={10} className="text-text-tertiary" />
                    {shortcut.label}
                  </button>
                ))}
              </div>
              {/* History */}
              <p className="mb-2 text-[11px] font-semibold text-text-primary">
                History
              </p>
              {history.length === 0 ? (
                <p className="py-4 text-center text-[11px] text-text-tertiary">
                  No query history
                </p>
              ) : (
                <div className="space-y-0.5">
                  {history.map((entry, i) => (
                    <button
                      key={`${entry.timestamp}-${i}`}
                      type="button"
                      onClick={() => {
                        setQuery(entry.query);
                        setMobileHistoryOpen(false);
                      }}
                      className="group w-full rounded px-2 py-2 text-left transition-colors hover:bg-bg-base"
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {entry.error ? (
                          <AlertCircle
                            size={9}
                            className="text-error shrink-0"
                          />
                        ) : (
                          <Terminal
                            size={9}
                            className="text-text-tertiary shrink-0"
                          />
                        )}
                        <span className="text-[10px] text-text-tertiary">
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </span>
                        <span className="text-[9px] text-text-tertiary ml-auto">
                          {entry.rowCount}r / {formatDuration(entry.durationMs)}
                        </span>
                      </div>
                      <p className="text-[11px] text-text-secondary font-mono truncate group-hover:text-text-primary">
                        {entry.query}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Schema helpers                                                     */
/* ------------------------------------------------------------------ */

function buildSqlCompletionSchema(tables: TableSchema[]): SQLNamespace {
  const namespace: Record<string, readonly string[]> = {};
  for (const table of tables) {
    namespace[table.name] = [
      "_id",
      "_creationTime",
      ...table.fields.map((field) => field.name)
    ];
  }
  return namespace;
}

function quoteSqlIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function SchemaBrowser({
  tables,
  loading,
  onSelectTable
}: {
  tables: TableSchema[];
  loading: boolean;
  onSelectTable: (tableName: string) => void;
}) {
  return (
    <div className="max-h-72 shrink-0 border-b border-border p-3">
      <div className="mb-2 flex items-center gap-2">
        <Table2 size={12} className="text-accent" />
        <span className="flex-1 text-[11px] font-semibold text-text-primary">
          Schema
        </span>
        {loading ? (
          <Loader2 size={11} className="animate-spin text-text-tertiary" />
        ) : (
          <span className="text-[10px] text-text-tertiary">
            {tables.length}
          </span>
        )}
      </div>
      <ScrollArea className="max-h-60">
        <div className="space-y-1 pr-1">
          {tables.length === 0 ? (
            <p className="py-4 text-center text-[10px] text-text-tertiary">
              No schema loaded
            </p>
          ) : (
            tables.map((table) => (
              <button
                key={table.name}
                type="button"
                onClick={() => onSelectTable(table.name)}
                className="group w-full rounded-md border border-transparent px-2 py-2 text-left transition-colors hover:border-border-hover hover:bg-bg-base"
                title={`Insert SELECT for ${table.name}`}
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-semibold text-text-primary">
                    {table.name}
                  </span>
                  <span className="rounded border border-border px-1.5 py-0.5 text-[9px] text-text-tertiary">
                    {table.documentCount}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {table.fields.slice(0, 5).map((field) => (
                    <span
                      key={field.name}
                      className="rounded bg-bg-elevated px-1.5 py-0.5 font-mono text-[9px] text-text-tertiary"
                      title={`${field.name}: ${field.type}`}
                    >
                      {field.name}
                    </span>
                  ))}
                  {table.fields.length > 5 && (
                    <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-[9px] text-text-tertiary">
                      +{table.fields.length - 5}
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Results table                                                      */
/* ------------------------------------------------------------------ */

function ResultsTable({ result }: { result: QueryResult }) {
  const prevRowsRef = useRef<unknown[][] | null>(null);
  const cellPulseVersionsRef = useRef<Map<string, number>>(new Map());
  const [changedCells, setChangedCells] = useState<Map<string, number>>(
    new Map()
  );

  useEffect(() => {
    if (result.mode !== "live") {
      prevRowsRef.current = null;
      setChangedCells(new Map());
      return;
    }

    const prevRows = prevRowsRef.current;
    prevRowsRef.current = result.rows;

    if (!prevRows) return;

    const changed = new Map<string, number>();
    const pulseVersions = cellPulseVersionsRef.current;

    for (let rowIdx = 0; rowIdx < result.rows.length; rowIdx++) {
      const row = result.rows[rowIdx]!;
      const prevRow = prevRows[rowIdx];
      if (!prevRow) {
        for (let cellIdx = 0; cellIdx < row.length; cellIdx++) {
          const key = `${rowIdx}:${cellIdx}`;
          const next = (pulseVersions.get(key) ?? 0) + 1;
          pulseVersions.set(key, next);
          changed.set(key, next);
        }
      } else {
        for (let cellIdx = 0; cellIdx < row.length; cellIdx++) {
          if (
            stableStringify(row[cellIdx]) !== stableStringify(prevRow[cellIdx])
          ) {
            const key = `${rowIdx}:${cellIdx}`;
            const next = (pulseVersions.get(key) ?? 0) + 1;
            pulseVersions.set(key, next);
            changed.set(key, next);
          }
        }
      }
    }

    if (changed.size > 0) {
      setChangedCells(changed);
      const timer = setTimeout(() => setChangedCells(new Map()), 1200);
      return () => clearTimeout(timer);
    }
  }, [result.rows, result.mode]);

  if (result.columns.length === 0 && result.rows.length === 0) {
    return (
      <div className="p-4 text-center animate-fade-in">
        <p className="text-[12px] text-text-secondary">
          {result.mode === "live"
            ? "Live query active."
            : "Query executed successfully."}{" "}
          {typeof result.rowsAffected === "number" && result.rowsAffected > 0
            ? `${result.rowsAffected} rows affected.`
            : ""}
        </p>
        <p className="text-[10px] text-text-tertiary mt-1">
          {formatDuration(result.durationMs)}
        </p>
        {result.invalidationScopes && result.invalidationScopes.length > 0 && (
          <p className="text-[10px] text-text-tertiary mt-1">
            Invalidated: {result.invalidationScopes.join(", ")}
          </p>
        )}
        {result.observedTables && result.observedTables.length > 0 && (
          <p className="text-[10px] text-text-tertiary mt-1">
            Watching: {result.observedTables.join(", ")}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col animate-fade-in">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-bg-surface px-3 py-2">
        <Badge variant="outline" className="text-[10px]">
          {result.rows.length} rows
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          {result.columns.length} columns
        </Badge>
        <span className="text-[10px] text-text-tertiary">
          {formatDuration(result.durationMs)}
        </span>
        {result.observedTables && result.observedTables.length > 0 && (
          <span className="ml-auto truncate text-[10px] text-text-tertiary">
            Watching {result.observedTables.join(", ")}
          </span>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="min-w-full overflow-x-auto bg-bg-base">
          <table className="w-max min-w-full border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-bg-surface">
              <tr className="border-b border-border">
                <th className="sticky left-0 z-20 w-12 border-r border-border bg-bg-surface px-2 py-2 text-center text-[10px] font-semibold text-text-tertiary">
                  #
                </th>
                {result.columns.map((col) => (
                  <th
                    key={col}
                    className="min-w-32 max-w-80 border-r border-border px-3 py-2 font-mono text-[10px] font-semibold text-text-tertiary last:border-r-0"
                    title={col}
                  >
                    <span className="block truncate">{col}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className="border-b border-border/80 transition-colors hover:bg-bg-elevated/50"
                >
                  <td className="sticky left-0 z-10 w-12 border-r border-border bg-bg-base px-2 py-1.5 text-center font-mono text-[10px] text-text-tertiary">
                    {rowIdx + 1}
                  </td>
                  {row.map((cell, cellIdx) => {
                    const cellKey = `${rowIdx}:${cellIdx}`;
                    const pulse = changedCells.get(cellKey);
                    return (
                      <td
                        key={cellIdx}
                        className={cn(
                          "max-w-80 border-r border-border px-3 py-1.5 font-mono text-[11px] last:border-r-0",
                          pulse !== undefined &&
                            (pulse % 2 === 0
                              ? "animate-highlight-a"
                              : "animate-highlight-b")
                        )}
                        title={formatSqlCellTitle(cell)}
                      >
                        <div className="max-w-72 truncate">
                          <SqlCellValue value={cell} />
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ScrollArea>
    </div>
  );
}

function formatSqlCellTitle(value: unknown): string {
  if (value === null) return "NULL";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function SqlCellValue({ value }: { value: unknown }) {
  if (value === null) {
    return <span className="text-text-tertiary italic">NULL</span>;
  }
  if (typeof value === "number") {
    return <span className="text-info">{value}</span>;
  }
  if (typeof value === "boolean") {
    return (
      <span className={value ? "text-success" : "text-text-tertiary"}>
        {String(value)}
      </span>
    );
  }
  if (typeof value === "string") {
    return <span className="text-text-secondary">{value}</span>;
  }
  return <span className="text-text-tertiary">{JSON.stringify(value)}</span>;
}
