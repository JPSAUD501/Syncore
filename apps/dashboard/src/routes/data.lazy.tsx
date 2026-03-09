import { createLazyFileRoute } from "@tanstack/react-router";
import {
  Database,
  Search,
  RefreshCw,
  Table2,
  Layers,
  Key,
  Loader2
} from "lucide-react";
import { useState, useMemo, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DataTable,
  DataFilters,
  DocumentPanel,
  SchemaViewer,
  IndexesViewer
} from "@/components/data";
import { EmptyState } from "@/components/shared";
import { useConnection } from "@/hooks";
import { sendRequest } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { TableSchema, DataFilter } from "@syncore/devtools-protocol";

export const Route = createLazyFileRoute("/data")({
  component: DataPage
});

function DataPage() {
  const { connected } = useConnection();

  /* ---------------------------------------------------------------- */
  /*  State                                                            */
  /* ---------------------------------------------------------------- */

  const [tables, setTables] = useState<TableSchema[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableSearch, setTableSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState<DataFilter[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<Record<
    string,
    unknown
  > | null>(null);

  /* ---------------------------------------------------------------- */
  /*  Fetch schema                                                     */
  /* ---------------------------------------------------------------- */

  const fetchSchema = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    try {
      const res = await sendRequest({ kind: "schema.get" });
      if (res.kind === "schema.result") {
        setTables(res.tables);
        if (res.tables.length > 0 && !selectedTable) {
          setSelectedTable(res.tables[0]!.name);
        }
      }
    } catch {
      /* runtime may not support schema.get yet */
    } finally {
      setLoading(false);
    }
  }, [connected, selectedTable]);

  /* ---------------------------------------------------------------- */
  /*  Fetch table data                                                 */
  /* ---------------------------------------------------------------- */

  const fetchData = useCallback(async () => {
    if (!connected || !selectedTable) return;
    setLoading(true);
    try {
      const payload: Parameters<typeof sendRequest>[0] = {
        kind: "data.query",
        table: selectedTable,
        limit: 100
      };
      if (filters.length > 0) {
        (payload as { filters?: typeof filters }).filters = filters;
      }
      const res = await sendRequest(payload);
      if (res.kind === "data.result") {
        setRows(res.rows);
        setTotalCount(res.totalCount);
      }
    } catch {
      /* runtime may not support data.query yet */
    } finally {
      setLoading(false);
    }
  }, [connected, selectedTable, filters]);

  useEffect(() => {
    if (selectedTable) {
      void fetchData();
    }
  }, [selectedTable, fetchData]);

  /* ---------------------------------------------------------------- */
  /*  Delete document                                                  */
  /* ---------------------------------------------------------------- */

  const handleDelete = useCallback(
    async (id: string) => {
      if (!connected || !selectedTable) return;
      try {
        await sendRequest({
          kind: "data.delete",
          table: selectedTable,
          id
        });
        setSelectedDoc(null);
        void fetchData();
      } catch {
        /* ignore */
      }
    },
    [connected, selectedTable, fetchData]
  );

  /* ---------------------------------------------------------------- */
  /*  Derived                                                          */
  /* ---------------------------------------------------------------- */

  const currentSchema = useMemo(
    () => tables.find((t) => t.name === selectedTable) ?? null,
    [tables, selectedTable]
  );

  const columns = useMemo(() => {
    if (currentSchema) return currentSchema.fields.map((f) => f.name);
    if (rows.length > 0) return Object.keys(rows[0]!);
    return [];
  }, [currentSchema, rows]);

  const filteredTables = useMemo(
    () =>
      tableSearch
        ? tables.filter((t) =>
            t.name.toLowerCase().includes(tableSearch.toLowerCase())
          )
        : tables,
    [tables, tableSearch]
  );

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className="flex h-[calc(100vh-7rem)]">
      {/* ---- Left sidebar: table list ---- */}
      <div className="w-64 shrink-0 border-r border-border flex flex-col">
        <div className="p-3 border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-[13px] font-bold text-text-primary flex-1">
              Tables
            </h2>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => void fetchSchema()}
              disabled={!connected || loading}
              title="Refresh schema"
            >
              <RefreshCw size={12} className={cn(loading && "animate-spin")} />
            </Button>
          </div>
          <div className="relative">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <Input
              placeholder="Search tables..."
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              className="pl-8 h-7 text-[12px]"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-1.5">
            {filteredTables.length === 0 ? (
              <div className="py-8 text-center">
                <Database
                  size={20}
                  className="mx-auto mb-2 text-text-tertiary"
                />
                <p className="text-[11px] text-text-tertiary">
                  {connected ? "No tables found" : "Connect to browse tables"}
                </p>
                {connected && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => void fetchSchema()}
                    className="mt-2"
                  >
                    Load Schema
                  </Button>
                )}
              </div>
            ) : (
              filteredTables.map((table) => (
                <button
                  key={table.name}
                  type="button"
                  onClick={() => {
                    setSelectedTable(table.name);
                    setSelectedDoc(null);
                    setFilters([]);
                  }}
                  className={cn(
                    "flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-[12px] transition-colors",
                    selectedTable === table.name
                      ? "bg-accent/10 text-text-primary"
                      : "text-text-secondary hover:bg-bg-surface hover:text-text-primary"
                  )}
                >
                  <Table2 size={12} className="text-text-tertiary shrink-0" />
                  <span className="truncate font-mono">{table.name}</span>
                  <Badge
                    variant="secondary"
                    className="ml-auto text-[9px] px-1 py-0 shrink-0"
                  >
                    {table.documentCount}
                  </Badge>
                </button>
              ))
            )}
          </div>
        </ScrollArea>

        <div className="p-3 border-t border-border text-[11px] text-text-tertiary">
          {tables.length} tables
        </div>
      </div>

      {/* ---- Right content: data view ---- */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedTable ? (
          <>
            {/* Toolbar */}
            <div className="p-3 border-b border-border flex items-center gap-3">
              <div className="flex items-center gap-2 flex-1">
                <h3 className="text-[13px] font-bold text-text-primary font-mono">
                  {selectedTable}
                </h3>
                <Badge variant="outline" className="text-[9px]">
                  {totalCount} rows
                </Badge>
                {loading && (
                  <Loader2
                    size={13}
                    className="animate-spin text-text-tertiary"
                  />
                )}
              </div>

              <Button
                variant="ghost"
                size="xs"
                onClick={() => void fetchData()}
                disabled={!connected}
                className="gap-1"
              >
                <RefreshCw size={11} />
                Refresh
              </Button>
            </div>

            {/* Filters */}
            <div className="px-3 py-2 border-b border-border">
              <DataFilters
                fields={columns}
                filters={filters}
                onFiltersChange={setFilters}
              />
            </div>

            {/* Content area with tabs */}
            <Tabs defaultValue="data" className="flex-1 flex flex-col min-h-0">
              <div className="px-3 border-b border-border">
                <TabsList variant="line" className="h-9">
                  <TabsTrigger value="data" className="gap-1">
                    <Table2 size={12} />
                    Data
                  </TabsTrigger>
                  <TabsTrigger value="schema" className="gap-1">
                    <Layers size={12} />
                    Schema
                  </TabsTrigger>
                  <TabsTrigger value="indexes" className="gap-1">
                    <Key size={12} />
                    Indexes
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="data" className="flex-1 min-h-0">
                <div className="flex h-full">
                  <div className="flex-1 min-w-0">
                    {rows.length === 0 ? (
                      <EmptyState
                        icon={Database}
                        title="No data"
                        description={
                          filters.length > 0
                            ? "No rows match the current filters."
                            : "This table is empty."
                        }
                        className="h-full"
                      />
                    ) : (
                      <DataTable
                        columns={columns}
                        rows={rows}
                        selectedRowId={
                          selectedDoc ? getDocumentId(selectedDoc) : null
                        }
                        onRowClick={setSelectedDoc}
                        className="h-full"
                      />
                    )}
                  </div>

                  {/* Document panel */}
                  {selectedDoc && (
                    <DocumentPanel
                      document={selectedDoc}
                      onClose={() => setSelectedDoc(null)}
                      onDelete={(id) => void handleDelete(id)}
                    />
                  )}
                </div>
              </TabsContent>

              <TabsContent value="schema" className="flex-1 min-h-0">
                <SchemaViewer schema={currentSchema} />
              </TabsContent>

              <TabsContent value="indexes" className="flex-1 min-h-0">
                <IndexesViewer indexes={currentSchema?.indexes ?? []} />
              </TabsContent>
            </Tabs>
          </>
        ) : (
          <EmptyState
            icon={Database}
            title="Select a table"
            description="Choose a table from the sidebar to browse its data, view schema, and inspect indexes."
            className="h-full"
          />
        )}
      </div>
    </div>
  );
}

function getDocumentId(document: Record<string, unknown>): string {
  const candidate = document._id ?? document.id;
  if (
    typeof candidate === "string" ||
    typeof candidate === "number" ||
    typeof candidate === "bigint"
  ) {
    return String(candidate);
  }
  return "unknown";
}
