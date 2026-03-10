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
import { sql as sqlLang } from "@codemirror/lang-sql";
import { EditorView } from "@codemirror/view";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/shared";
import { useConnection } from "@/hooks";
import { useDevtoolsSubscription } from "@/hooks/useReactiveData";
import { sendRequest } from "@/lib/store";
import { cn, formatDuration } from "@/lib/utils";

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

const STORAGE_KEY = "syncore-sql-history";

const PRAGMA_SHORTCUTS: Array<{ label: string; query: string }> = [
  {
    label: "Table List",
    query: "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
  },
  {
    label: "Schema Info",
    query: "SELECT sql FROM sqlite_master WHERE type='table';"
  },
  {
    label: "Index List",
    query: "SELECT name, tbl_name FROM sqlite_master WHERE type='index';"
  },
  { label: "Database Size", query: "PRAGMA page_count; PRAGMA page_size;" },
  { label: "Journal Mode", query: "PRAGMA journal_mode;" },
  { label: "WAL Status", query: "PRAGMA wal_checkpoint;" },
  { label: "Foreign Keys", query: "PRAGMA foreign_keys;" },
  { label: "Integrity Check", query: "PRAGMA integrity_check;" }
];

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
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SqlMode>("read");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const parsed = stored ? (JSON.parse(stored) as unknown) : [];
      return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
    } catch {
      return [];
    }
  });
  const editorRef = useRef<ReactCodeMirrorRef>(null);

  /* ---------------------------------------------------------------- */
  /*  Persist history                                                  */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, 50)));
    } catch {
      /* ignore quota errors */
    }
  }, [history]);

  const liveStartedAtRef = useRef<number | null>(null);

  const liveSubscription = useDevtoolsSubscription(
    isReady && mode === "live" && query.trim()
      ? { kind: "sql.watch", query: query.trim() }
      : null,
    {
      enabled: isReady && mode === "live" && query.trim().length > 0
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
    async (sql?: string) => {
      const queryText = sql ?? query.trim();
      if (!queryText || !isReady) return;
      if (mode === "live") {
        return;
      }

      setLoading(true);
      const startTime = performance.now();

      try {
        const res = await sendRequest({
          kind: mode === "write" ? "sql.write" : "sql.read",
          query: queryText
        });
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
          mode,
          error: errorMsg
        });
      } finally {
        setLoading(false);
      }
    },
    [query, isReady, mode]
  );

  useEffect(() => {
    if (mode !== "live") {
      liveStartedAtRef.current = null;
      return;
    }
    const queryText = query.trim();
    if (!queryText) {
      liveStartedAtRef.current = null;
      setResult(null);
      return;
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
  }, [liveSubscription.data, liveSubscription.loading, mode, query]);

  /* ---------------------------------------------------------------- */
  /*  Clear history                                                    */
  /* ---------------------------------------------------------------- */

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  /* ---------------------------------------------------------------- */
  /*  CodeMirror extensions                                            */
  /* ---------------------------------------------------------------- */

  const extensions = useMemo(
    () => [
      sqlLang(),
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
    [executeQuery]
  );

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

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
                disabled={!isReady || loading || !query.trim()}
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
                  onClick={() => setMode(nextMode)}
                  className={cn(
                    "rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
                    mode === nextMode
                      ? "bg-accent text-bg-deep"
                      : "text-text-tertiary hover:text-text-primary"
                  )}
                >
                  {nextMode[0]!.toUpperCase() + nextMode.slice(1)}
                </button>
              ))}
            </div>

            <span className="text-[11px] text-text-tertiary">
              {mode === "live" ? "Live updates enabled" : "Ctrl+Enter to run"}
            </span>

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
          {mode === "live" && liveSubscription.loading && !result ? (
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

      {/* ---- Right sidebar: PRAGMA shortcuts + history ---- */}
      <div className="hidden w-64 shrink-0 overflow-hidden rounded-md border border-border bg-bg-surface lg:flex lg:flex-col">
        {/* PRAGMA shortcuts */}
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
                  setQuery(shortcut.query);
                  void executeQuery(shortcut.query);
                }}
                disabled={!isReady || mode === "live"}
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
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Results table                                                      */
/* ------------------------------------------------------------------ */

function ResultsTable({ result }: { result: QueryResult }) {
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
    <ScrollArea className="flex-1">
      <div className="min-w-full animate-fade-in bg-bg-base">
        {/* Header */}
        <div className="sticky top-0 z-10 flex border-b border-border bg-bg-surface">
          <div className="w-12 shrink-0 border-r border-border px-2 py-2 text-center text-[10px] font-semibold text-text-tertiary">
            #
          </div>
          {result.columns.map((col) => (
            <div
              key={col}
              className="flex-shrink-0 min-w-[120px] max-w-[300px] w-auto border-r border-border px-3 py-2 text-[10px] font-semibold text-text-tertiary last:border-r-0"
            >
              {col}
            </div>
          ))}
        </div>

        {/* Data rows */}
        {result.rows.map((row, rowIdx) => (
          <div
            key={rowIdx}
            className="flex border-b border-border hover:bg-bg-elevated/50 transition-colors"
          >
            <div className="w-12 shrink-0 px-2 py-1.5 text-[10px] text-text-tertiary border-r border-border text-center font-mono">
              {rowIdx + 1}
            </div>
            {row.map((cell, cellIdx) => (
              <div
                key={cellIdx}
                className="flex-shrink-0 min-w-[120px] max-w-[300px] w-auto px-3 py-1.5 text-[11px] font-mono border-r border-border last:border-r-0 truncate"
              >
                <SqlCellValue value={cell} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
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
