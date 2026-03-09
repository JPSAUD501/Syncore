import { createLazyFileRoute } from "@tanstack/react-router";
import {
  Database,
  Search,
  Table2,
  Layers,
  Key,
  Loader2,
  Circle
} from "lucide-react";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ConfirmActionDialog,
  DataTable,
  DataFilters,
  DocumentPanel,
  DocumentEditorDialog,
  ImportDocumentsDialog,
  SchemaViewer,
  IndexesViewer
} from "@/components/data";
import { EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useConnection } from "@/hooks";
import { useDevtoolsSubscription } from "@/hooks/useReactiveData";
import { sendRequest } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { TableSchema, DataFilter } from "@syncore/devtools-protocol";
import {
  Download,
  Plus,
  Upload,
  PencilLine,
  CopyPlus,
  Trash2,
  X,
  Keyboard
} from "lucide-react";

export const Route = createLazyFileRoute("/data")({
  component: DataPage
});

function DataPage() {
  const { connected } = useConnection();
  const { pushToast } = useToast();

  /* ---------------------------------------------------------------- */
  /*  State                                                            */
  /* ---------------------------------------------------------------- */

  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableSearch, setTableSearch] = useState("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState<DataFilter[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<
    "insert" | "patch" | "duplicate"
  >("insert");
  const [fieldEditState, setFieldEditState] = useState<{
    id: string;
    field: string;
    value: unknown;
  } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteManyOpen, setConfirmDeleteManyOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importSeedText, setImportSeedText] = useState<string | undefined>(
    undefined
  );
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const selectedTableRef = useRef(selectedTable);
  selectedTableRef.current = selectedTable;

  /* ---------------------------------------------------------------- */
  /*  Reactive schema fetch                                            */
  /* ---------------------------------------------------------------- */

  const schemaSubscription = useDevtoolsSubscription(
    connected ? { kind: "schema.tables" } : null,
    { enabled: connected }
  );

  const tableList = useMemo(
    () =>
      schemaSubscription.data?.kind === "schema.tables.result"
        ? schemaSubscription.data.tables
        : [],
    [schemaSubscription.data]
  );

  // Auto-select first table
  useEffect(() => {
    if (tableList.length > 0 && !selectedTable) {
      setSelectedTable(tableList[0]!.name);
    }
  }, [tableList, selectedTable]);

  /* ---------------------------------------------------------------- */
  /*  Fetch table data (reactive via runtime events)                   */
  /* ---------------------------------------------------------------- */

  const dataSubscription = useDevtoolsSubscription(
    connected && selectedTable
      ? {
          kind: "data.table",
          table: selectedTable,
          ...(filters.length > 0 ? { filters } : {}),
          limit: 100
        }
      : null,
    { enabled: connected && !!selectedTable }
  );

  useEffect(() => {
    if (dataSubscription.data?.kind === "data.table.result") {
      setRows(dataSubscription.data.rows);
      setTotalCount(dataSubscription.data.totalCount);
    }
  }, [dataSubscription.data]);

  useEffect(() => {
    setDataLoading(dataSubscription.loading);
  }, [dataSubscription.loading]);

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
        pushToast({
          tone: "success",
          title: "Document deleted",
          description: `${id} was removed from ${selectedTable}.`
        });
      } catch (err) {
        pushToast({
          tone: "error",
          title: "Delete failed",
          description: err instanceof Error ? err.message : "Unknown error"
        });
      }
    },
    [connected, selectedTable, pushToast]
  );

  const handleDeleteMany = useCallback(
    async (ids: string[]) => {
      if (!connected || !selectedTable || ids.length === 0) return;
      await Promise.all(
        ids.map((id) =>
          sendRequest({
            kind: "data.delete",
            table: selectedTable,
            id
          })
        )
      );
      setSelectedRowIds([]);
      setSelectedDoc((current) =>
        current && ids.includes(getDocumentId(current)) ? null : current
      );
      pushToast({
        tone: "success",
        title: "Documents deleted",
        description: `${ids.length} document${ids.length === 1 ? "" : "s"} removed from ${selectedTable}.`
      });
    },
    [connected, selectedTable, pushToast]
  );

  const handleInsert = useCallback(
    async (
      document: Record<string, unknown>,
      options?: { silent?: boolean }
    ) => {
      if (!connected || !selectedTable) return;
      const res = await sendRequest({
        kind: "data.insert",
        table: selectedTable,
        document
      });
      if (res.kind === "data.mutate.result" && !res.success) {
        throw new Error(res.error ?? "Failed to insert document.");
      }
      if (!options?.silent) {
        pushToast({
          tone: "success",
          title: "Document created",
          description: `A new document was added to ${selectedTable}.`
        });
      }
    },
    [connected, selectedTable, pushToast]
  );

  const handlePatch = useCallback(
    async (id: string, fields: Record<string, unknown>) => {
      if (!connected || !selectedTable) return;
      const res = await sendRequest({
        kind: "data.patch",
        table: selectedTable,
        id,
        fields
      });
      if (res.kind === "data.mutate.result" && !res.success) {
        throw new Error(res.error ?? "Failed to update document.");
      }
      pushToast({
        tone: "success",
        title: "Document updated",
        description: `${id} was updated.`
      });
    },
    [connected, selectedTable, pushToast]
  );

  const handleFieldEdit = useCallback(
    async (id: string, field: string, value: unknown) => {
      await handlePatch(id, { [field]: value });
      setFieldEditState(null);
    },
    [handlePatch]
  );

  const handleImport = useCallback(
    async (documents: Record<string, unknown>[]) => {
      for (const document of documents) {
        await handleInsert(document, { silent: true });
      }
      pushToast({
        tone: "success",
        title: "Import complete",
        description: `${documents.length} document${documents.length === 1 ? "" : "s"} imported into ${selectedTable}.`
      });
    },
    [handleInsert, pushToast, selectedTable]
  );

  const handleExport = useCallback(() => {
    if (!selectedTable) return;
    const blob = new Blob([JSON.stringify(rows, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedTable}.json`;
    link.click();
    URL.revokeObjectURL(url);
    pushToast({
      tone: "info",
      title: "Export ready",
      description: `${rows.length} rows exported from ${selectedTable}.`
    });
  }, [pushToast, rows, selectedTable]);

  const handleExportSelection = useCallback(() => {
    if (!selectedTable || selectedRowIds.length === 0) return;
    const selectedSet = new Set(selectedRowIds);
    const selectedRows = rows.filter((row) =>
      selectedSet.has(getDocumentId(row))
    );
    const blob = new Blob([JSON.stringify(selectedRows, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedTable}-selection.json`;
    link.click();
    URL.revokeObjectURL(url);
    pushToast({
      tone: "info",
      title: "Selection exported",
      description: `${selectedRows.length} selected row${selectedRows.length === 1 ? "" : "s"} exported.`
    });
  }, [pushToast, rows, selectedRowIds, selectedTable]);

  const handleDuplicateMany = useCallback(async () => {
    const selectedSet = new Set(selectedRowIds);
    const selectedRows = rows.filter((row) =>
      selectedSet.has(getDocumentId(row))
    );
    for (const row of selectedRows) {
      await handleInsert(stripSystemFields(row), { silent: true });
    }
    setSelectedRowIds([]);
    pushToast({
      tone: "success",
      title: "Documents duplicated",
      description: `${selectedRows.length} document${selectedRows.length === 1 ? "" : "s"} duplicated.`
    });
  }, [handleInsert, pushToast, rows, selectedRowIds]);

  const handlePasteIntoImport = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) return;
      setImportSeedText(text);
      setImportOpen(true);
    } catch {
      /* clipboard may be unavailable */
    }
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Derived                                                          */
  /* ---------------------------------------------------------------- */

  const currentSchema = useMemo(
    () => tableList.find((t) => t.name === selectedTable) ?? null,
    [tableList, selectedTable]
  );

  const selectedDocId = useMemo(
    () => (selectedDoc ? getDocumentId(selectedDoc) : null),
    [selectedDoc]
  );

  const liveSelectedDoc = useMemo(() => {
    if (!selectedDocId) return null;
    return rows.find((row) => getDocumentId(row) === selectedDocId) ?? null;
  }, [rows, selectedDocId]);

  useEffect(() => {
    if (selectedDocId && !liveSelectedDoc) {
      setSelectedDoc(null);
    }
  }, [liveSelectedDoc, selectedDocId]);

  useEffect(() => {
    const liveIds = new Set(rows.map((row) => getDocumentId(row)));
    setSelectedRowIds((current) => current.filter((id) => liveIds.has(id)));
  }, [rows]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const isEditableTarget =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT");

      if (isEditableTarget) return;
      if (
        editorOpen ||
        importOpen ||
        fieldEditState !== null ||
        confirmDeleteManyOpen ||
        confirmDeleteId !== null
      ) {
        return;
      }

      const mod = event.metaKey || event.ctrlKey;

      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedRowIds.length > 0) {
          event.preventDefault();
          setConfirmDeleteManyOpen(true);
          return;
        }
        if (liveSelectedDoc) {
          event.preventDefault();
          setConfirmDeleteId(getDocumentId(liveSelectedDoc));
        }
        return;
      }

      if (mod && event.key.toLowerCase() === "a") {
        if (rows.length === 0) return;
        event.preventDefault();
        setSelectedRowIds(rows.map((row) => getDocumentId(row)));
        pushToast({
          tone: "info",
          title: "Rows selected",
          description: `${rows.length} visible row${rows.length === 1 ? "" : "s"} selected.`
        });
        return;
      }

      if (mod && event.key.toLowerCase() === "c") {
        const selectedSet = new Set(selectedRowIds);
        const rowsToCopy =
          selectedRowIds.length > 0
            ? rows.filter((row) => selectedSet.has(getDocumentId(row)))
            : liveSelectedDoc
              ? [liveSelectedDoc]
              : [];

        if (rowsToCopy.length === 0) return;

        event.preventDefault();
        void navigator.clipboard.writeText(JSON.stringify(rowsToCopy, null, 2));
        pushToast({
          tone: "success",
          title: "Copied to clipboard",
          description: `${rowsToCopy.length} document${rowsToCopy.length === 1 ? "" : "s"} copied as JSON.`
        });
        return;
      }

      if (mod && event.key.toLowerCase() === "v") {
        event.preventDefault();
        void handlePasteIntoImport();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    confirmDeleteId,
    confirmDeleteManyOpen,
    editorOpen,
    fieldEditState,
    handlePasteIntoImport,
    importOpen,
    liveSelectedDoc,
    pushToast,
    rows,
    selectedRowIds
  ]);

  const selectedRowsCount = selectedRowIds.length;

  const columns = useMemo(() => {
    if (currentSchema) return currentSchema.fields.map((f) => f.name);
    if (rows.length > 0) return Object.keys(rows[0]!);
    return [];
  }, [currentSchema, rows]);

  const filteredTables = useMemo(
    () =>
      tableSearch
        ? tableList.filter((t) =>
            t.name.toLowerCase().includes(tableSearch.toLowerCase())
          )
        : tableList,
    [tableList, tableSearch]
  );

  const loading = schemaSubscription.loading || dataLoading;

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className="flex h-[calc(100vh-7rem)]">
      {/* ---- Left sidebar: table list ---- */}
      <div className="w-64 shrink-0 border-r border-border flex flex-col hidden md:flex">
        <div className="p-3 border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-[13px] font-bold text-text-primary flex-1">
              Tables
            </h2>
            {schemaSubscription.loading && (
              <Loader2 size={12} className="animate-spin text-text-tertiary" />
            )}
            {schemaSubscription.data && (
              <Circle
                size={6}
                fill="var(--color-accent)"
                stroke="none"
                className="animate-live-dot"
              />
            )}
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
              </div>
            ) : (
              filteredTables.map((table) => (
                <button
                  key={table.name}
                  type="button"
                  onClick={() => {
                    setSelectedTable(table.name);
                    setSelectedDoc(null);
                    setSelectedRowIds([]);
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
          {tableList.length} tables
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
                {/* Live indicator instead of refresh */}
                <div className="flex items-center gap-1.5 ml-2">
                  <Circle
                    size={5}
                    fill="var(--color-success)"
                    stroke="none"
                    className="animate-live-dot"
                  />
                  <span className="text-[10px] text-text-tertiary">Live</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto">
                <Button
                  variant="outline"
                  size="xs"
                  className="gap-1"
                  onClick={() => {
                    setEditorMode("insert");
                    setEditorOpen(true);
                  }}
                  disabled={!selectedTable}
                >
                  <Plus size={11} />
                  New
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  className="gap-1"
                  onClick={() => {
                    setImportSeedText(undefined);
                    setImportOpen(true);
                  }}
                  disabled={!selectedTable}
                >
                  <Upload size={11} />
                  Import
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  className="gap-1"
                  onClick={handleExport}
                  disabled={rows.length === 0}
                >
                  <Download size={11} />
                  Export
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  className="gap-1 hidden sm:inline-flex"
                  onClick={() => setShortcutsOpen(true)}
                >
                  <Keyboard size={11} />
                  Shortcuts
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  className="gap-1 hidden sm:inline-flex"
                  onClick={() => {
                    if (!liveSelectedDoc) return;
                    setEditorMode("patch");
                    setEditorOpen(true);
                  }}
                  disabled={!liveSelectedDoc}
                >
                  <PencilLine size={11} />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  className="gap-1 hidden sm:inline-flex"
                  onClick={() => {
                    if (!liveSelectedDoc) return;
                    setEditorMode("duplicate");
                    setEditorOpen(true);
                  }}
                  disabled={!liveSelectedDoc}
                >
                  <CopyPlus size={11} />
                  Duplicate
                </Button>
              </div>
            </div>

            {selectedRowsCount > 0 && (
              <div className="flex items-center gap-2 border-b border-border bg-accent/5 px-3 py-2">
                <Badge variant="warning" className="text-[10px]">
                  {selectedRowsCount} selected
                </Badge>
                <Button
                  variant="ghost"
                  size="xs"
                  className="gap-1"
                  onClick={() => void handleDuplicateMany()}
                >
                  <CopyPlus size={11} />
                  Duplicate selected
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  className="gap-1"
                  onClick={handleExportSelection}
                >
                  <Download size={11} />
                  Export selected
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  className="gap-1 text-error hover:text-error"
                  onClick={() => setConfirmDeleteManyOpen(true)}
                >
                  <Trash2 size={11} />
                  Delete selected
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="ml-auto"
                  onClick={() => setSelectedRowIds([])}
                  title="Clear selection"
                >
                  <X size={11} />
                </Button>
              </div>
            )}

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
                        selectedRowIds={selectedRowIds}
                        onRowClick={setSelectedDoc}
                        onToggleRowSelection={(rowId) => {
                          setSelectedRowIds((current) =>
                            current.includes(rowId)
                              ? current.filter((id) => id !== rowId)
                              : [...current, rowId]
                          );
                        }}
                        onToggleAllRows={(rowIds, checked) => {
                          setSelectedRowIds((current) => {
                            if (checked) {
                              return Array.from(
                                new Set([...current, ...rowIds])
                              );
                            }
                            const toRemove = new Set(rowIds);
                            return current.filter((id) => !toRemove.has(id));
                          });
                        }}
                        onCellEdit={(rowId, field, value) => {
                          void handleFieldEdit(rowId, field, value);
                        }}
                        className="h-full"
                      />
                    )}
                  </div>

                  {/* Document panel */}
                  {liveSelectedDoc && (
                    <DocumentPanel
                      document={liveSelectedDoc}
                      onClose={() => setSelectedDoc(null)}
                      onEditField={(id, field, value) =>
                        setFieldEditState({ id, field, value })
                      }
                      onEditDocument={() => {
                        setEditorMode("patch");
                        setEditorOpen(true);
                      }}
                      onDuplicate={() => {
                        setEditorMode("duplicate");
                        setEditorOpen(true);
                      }}
                      onDelete={(id) => setConfirmDeleteId(id)}
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

      <DocumentEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        title={
          editorMode === "insert"
            ? "Create Document"
            : editorMode === "duplicate"
              ? "Duplicate Document"
              : "Edit Document"
        }
        description={
          editorMode === "insert"
            ? "Create a new document in the selected table."
            : editorMode === "duplicate"
              ? "Create a new document based on the selected one."
              : "Patch the selected document by editing its JSON payload."
        }
        submitLabel={
          editorMode === "insert" || editorMode === "duplicate"
            ? "Create"
            : "Save Changes"
        }
        initialDocument={
          editorMode === "insert" ? {} : (liveSelectedDoc ?? undefined)
        }
        hint={
          editorMode === "patch"
            ? "System fields are preserved automatically. Only your JSON fields are patched."
            : "You can paste nested objects and arrays here."
        }
        requireDirty={editorMode === "patch"}
        onSubmit={async (document) => {
          if (editorMode === "insert" || editorMode === "duplicate") {
            await handleInsert(document);
            return;
          }

          if (!liveSelectedDoc) {
            throw new Error("Select a document before editing it.");
          }

          await handlePatch(getDocumentId(liveSelectedDoc), document);
        }}
      />

      <ImportDocumentsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        tableName={selectedTable}
        initialText={importSeedText}
        onImport={handleImport}
      />

      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Data Browser Shortcuts</DialogTitle>
            <DialogDescription>
              Quick commands for selection, clipboard and delete flows.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 text-[12px]">
            {[
              ["Cmd/Ctrl+A", "Select all visible rows"],
              ["Cmd/Ctrl+C", "Copy selected rows or open document as JSON"],
              ["Cmd/Ctrl+V", "Open import with clipboard contents"],
              ["Delete / Backspace", "Delete selected rows or open document"],
              ["Double click cell", "Edit a single field inline"]
            ].map(([shortcut, description]) => (
              <div
                key={shortcut}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-bg-base/60 px-3 py-2"
              >
                <code className="rounded bg-bg-surface px-1.5 py-0.5 text-[11px] text-accent">
                  {shortcut}
                </code>
                <span className="text-right text-text-secondary">
                  {description}
                </span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteId(null);
        }}
        title="Delete document"
        description="This permanently removes the selected document from the table."
        confirmLabel="Delete document"
        onConfirm={() => {
          if (!confirmDeleteId) return;
          void handleDelete(confirmDeleteId);
        }}
      />

      <ConfirmActionDialog
        open={confirmDeleteManyOpen}
        onOpenChange={setConfirmDeleteManyOpen}
        title="Delete selected documents"
        description={`This permanently removes ${selectedRowIds.length} selected document${selectedRowIds.length === 1 ? "" : "s"}.`}
        confirmLabel="Delete selected"
        onConfirm={() => {
          void handleDeleteMany(selectedRowIds);
        }}
      />

      <DocumentEditorDialog
        open={fieldEditState !== null}
        onOpenChange={(open) => {
          if (!open) setFieldEditState(null);
        }}
        title={
          fieldEditState ? `Edit Field: ${fieldEditState.field}` : "Edit Field"
        }
        description="Update a single field using JSON-compatible syntax."
        submitLabel="Update Field"
        initialDocument={
          fieldEditState
            ? { [fieldEditState.field]: fieldEditState.value }
            : undefined
        }
        hint="Primitive values, arrays, objects, null, true and false are all supported."
        requireDirty
        onSubmit={async (document) => {
          if (!fieldEditState) {
            throw new Error("No field selected.");
          }
          await handleFieldEdit(
            fieldEditState.id,
            fieldEditState.field,
            document[fieldEditState.field]
          );
        }}
      />
    </div>
  );
}

function stripSystemFields(document: Record<string, unknown>) {
  const next = { ...document };
  delete next._id;
  delete next._creationTime;
  return next;
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
