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
  Sparkles,
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
  rowsAffected: number;
  durationMs: number;
  error?: string;
}

interface HistoryEntry {
  query: string;
  timestamp: number;
  durationMs: number;
  rowCount: number;
  error?: string;
}

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
  const { connected } = useConnection();
  const [query, setQuery] = useState("");
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

  /* ---------------------------------------------------------------- */
  /*  Execute query                                                    */
  /* ---------------------------------------------------------------- */

  const executeQuery = useCallback(
    async (sql?: string) => {
      const queryText = sql ?? query.trim();
      if (!queryText || !connected) return;

      setLoading(true);
      const startTime = performance.now();

      try {
        const res = await sendRequest({
          kind: "sql.execute",
          query: queryText
        });
        const durationMs = performance.now() - startTime;

        if (res.kind === "sql.result") {
          const queryResult: QueryResult = {
            columns: res.columns,
            rows: res.rows,
            rowsAffected: res.rowsAffected,
            durationMs
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
            rowCount: res.rows.length
          };
          if (res.error) entry.error = res.error;
          setHistory((prev) => [entry, ...prev.slice(0, 49)]);
        }
      } catch (err) {
        const durationMs = performance.now() - startTime;
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        setResult({
          columns: [],
          rows: [],
          rowsAffected: 0,
          durationMs,
          error: errorMsg
        });
      } finally {
        setLoading(false);
      }
    },
    [query, connected]
  );

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
    <div className="flex h-[calc(100vh-7rem)]">
      {/* ---- Main content ---- */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Editor area — enhanced with sql-editor-wrapper */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-3">
            <Terminal size={14} className="text-accent" />
            <h2 className="text-[13px] font-bold text-text-primary flex-1">
              SQL Console
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
              placeholder="SELECT * FROM users LIMIT 10;"
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

          <div className="flex items-center gap-2 mt-3">
            <Button
              onClick={() => void executeQuery()}
              disabled={!connected || loading || !query.trim()}
              size="sm"
              className="gap-1.5 px-4"
            >
              {loading ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Play size={13} />
              )}
              {loading ? "Executing..." : "Execute"}
            </Button>

            <span className="text-[10px] text-text-tertiary">
              Ctrl+Enter to run
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
        <div className="flex-1 min-h-0 flex flex-col">
          {result ? (
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
              description="Write SQL and press Ctrl+Enter or click Execute to see results. Use PRAGMA shortcuts on the right for common operations."
              className="h-full"
            />
          )}
        </div>
      </div>

      {/* ---- Right sidebar: PRAGMA shortcuts + history ---- */}
      <div className="w-64 shrink-0 border-l border-border flex flex-col hidden lg:flex">
        {/* PRAGMA shortcuts */}
        <div className="p-3 border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={12} className="text-accent" />
            <span className="text-[11px] font-bold text-text-primary">
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
                disabled={!connected}
                className={cn(
                  "flex items-center gap-2 w-full px-2 py-1.5 rounded text-[11px] text-text-secondary",
                  "hover:bg-bg-surface hover:text-text-primary transition-colors",
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
          <div className="p-3 border-b border-border flex items-center gap-2">
            <History size={12} className="text-text-tertiary" />
            <span className="text-[11px] font-bold text-text-primary flex-1">
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
                      "w-full text-left px-2 py-1.5 rounded transition-colors",
                      "hover:bg-bg-surface group"
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
          Query executed successfully.{" "}
          {result.rowsAffected > 0 && `${result.rowsAffected} rows affected.`}
        </p>
        <p className="text-[10px] text-text-tertiary mt-1">
          {formatDuration(result.durationMs)}
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="min-w-full animate-fade-in">
        {/* Header */}
        <div className="flex border-b border-border bg-bg-surface/50 sticky top-0 z-10">
          <div className="w-12 shrink-0 px-2 py-2 text-[10px] uppercase tracking-wider font-semibold text-text-tertiary border-r border-border text-center">
            #
          </div>
          {result.columns.map((col) => (
            <div
              key={col}
              className="flex-shrink-0 min-w-[120px] max-w-[300px] w-auto px-3 py-2 text-[10px] uppercase tracking-wider font-semibold text-text-tertiary border-r border-border last:border-r-0"
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
