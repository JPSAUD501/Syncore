import { createLazyFileRoute } from "@tanstack/react-router";
import {
  Database,
  Search,
  Table2,
  Layers,
  Key,
  Loader2
} from "lucide-react";
import { useState, useMemo, useCallback, useEffect } from "react";
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
import { usePreferredTarget } from "@/hooks";
import { useDevtoolsSubscription } from "@/hooks/useReactiveData";
import { useActiveRuntime } from "@/lib/store";
import { sendRequest } from "@/lib/store";
import { parseEditableCellValue, toEditableCellText } from "@/lib/dataValue";
import { cn } from "@/lib/utils";
import type { DataFilter } from "@syncore/devtools-protocol";
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
  const { targetRuntimeId, usingProjectTarget } = usePreferredTarget();
  const activeRuntime = useActiveRuntime();
  const { pushToast } = useToast();

  /* ---------------------------------------------------------------- */
  /*  State                                                            */
  /* ---------------------------------------------------------------- */

  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableSearch, setTableSearch] = useState("");
  const [activePanelTab, setActivePanelTab] = useState<"data" | "schema" | "indexes">("data");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState<DataFilter[]>([]);
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
  const [mobileTablesOpen, setMobileTablesOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);

  /* ---------------------------------------------------------------- */
  /*  Reactive schema fetch                                            */
  /* ---------------------------------------------------------------- */

  const schemaSubscription = useDevtoolsSubscription(
    targetRuntimeId ? { kind: "schema.tables" } : null,
    { enabled: Boolean(targetRuntimeId), targetRuntimeId }
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

  useEffect(() => {
    if (selectedTable) {
      setActivePanelTab("data");
    }
  }, [selectedTable]);

  /* ---------------------------------------------------------------- */
  /*  Fetch table data (reactive via runtime events)                   */
  /* ---------------------------------------------------------------- */

  const dataSubscription = useDevtoolsSubscription(
    targetRuntimeId && selectedTable
      ? {
          kind: "data.table",
          table: selectedTable,
          ...(filters.length > 0 ? { filters } : {}),
          limit: 100
        }
      : null,
    {
      enabled: Boolean(targetRuntimeId) && !!selectedTable,
      targetRuntimeId
    }
  );

  useEffect(() => {
    if (dataSubscription.data?.kind === "data.table.result") {
      const nextRows = dataSubscription.data.rows;
      const nextTotalCount = dataSubscription.data.totalCount;
      setRows((current) =>
        shallowEqualRows(current, nextRows) ? current : nextRows
      );
      setTotalCount((current) =>
        current === nextTotalCount ? current : nextTotalCount
      );
    }
  }, [dataSubscription.data]);

  useEffect(() => {
    if (targetRuntimeId && !dataSubscription.loading) {
      return;
    }
    setRows((current) => (current.length === 0 ? current : []));
    setTotalCount((current) => (current === 0 ? current : 0));
    setSelectedRowIds((current) => (current.length === 0 ? current : []));
  }, [dataSubscription.loading, targetRuntimeId]);

  useEffect(() => {
    setDataLoading((current) =>
      current === dataSubscription.loading ? current : dataSubscription.loading
    );
  }, [dataSubscription.loading]);

  /* ---------------------------------------------------------------- */
  /*  Delete document                                                  */
  /* ---------------------------------------------------------------- */

  const handleDelete = useCallback(
    async (id: string) => {
      if (!targetRuntimeId || !selectedTable) return;
      try {
        await sendRequest({
          kind: "data.delete",
          table: selectedTable,
          id
        }, { targetRuntimeId });
        setSelectedRowIds((current) => current.filter((rowId) => rowId !== id));
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
    [pushToast, selectedTable, targetRuntimeId]
  );

  const handleDeleteMany = useCallback(
    async (ids: string[]) => {
      if (!targetRuntimeId || !selectedTable || ids.length === 0) return;
      await Promise.all(
        ids.map((id) =>
          sendRequest({
            kind: "data.delete",
            table: selectedTable,
            id
          }, { targetRuntimeId })
        )
      );
      setSelectedRowIds([]);
      pushToast({
        tone: "success",
        title: "Documents deleted",
        description: `${ids.length} document${ids.length === 1 ? "" : "s"} removed from ${selectedTable}.`
      });
    },
    [pushToast, selectedTable, targetRuntimeId]
  );

  const handleInsert = useCallback(
    async (
      document: Record<string, unknown>,
      options?: { silent?: boolean }
    ) => {
      if (!targetRuntimeId || !selectedTable) return;
      const res = await sendRequest({
        kind: "data.insert",
        table: selectedTable,
        document
      }, { targetRuntimeId });
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
    [pushToast, selectedTable, targetRuntimeId]
  );

  const handlePatch = useCallback(
    async (id: string, fields: Record<string, unknown>) => {
      if (!targetRuntimeId || !selectedTable) return;
      const res = await sendRequest({
        kind: "data.patch",
        table: selectedTable,
        id,
        fields
      }, { targetRuntimeId });
      if (res.kind === "data.mutate.result" && !res.success) {
        throw new Error(res.error ?? "Failed to update document.");
      }
      pushToast({
        tone: "success",
        title: "Document updated",
        description: `${id} was updated.`
      });
    },
    [pushToast, selectedTable, targetRuntimeId]
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
    () => (selectedRowIds.length === 1 ? selectedRowIds[0] ?? null : null),
    [selectedRowIds]
  );

  const liveSelectedDoc = useMemo(() => {
    if (!selectedDocId) return null;
    return rows.find((row) => getDocumentId(row) === selectedDocId) ?? null;
  }, [rows, selectedDocId]);

  useEffect(() => {
    if (selectedDocId && !liveSelectedDoc) {
      setSelectedRowIds((current) => current.filter((id) => id !== selectedDocId));
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
  const dataError = firstString(
    dataSubscription.error,
    schemaSubscription.error,
    activeRuntime?.lastSubscriptionError
  );

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-3">
      {/* ---- Left sidebar: table list ---- */}
      <div className="hidden min-h-0 w-72 shrink-0 md:flex">
        <TableDirectory
          filteredTables={filteredTables}
          targetAvailable={Boolean(targetRuntimeId)}
          usingProjectTarget={usingProjectTarget}
          schemaLoading={schemaSubscription.loading}
          hasSchemaData={Boolean(schemaSubscription.data)}
          selectedTable={selectedTable}
          tableCount={tableList.length}
          tableSearch={tableSearch}
          onTableSearchChange={setTableSearch}
          onSelectTable={(tableName) => {
            setSelectedTable(tableName);
            setSelectedRowIds([]);
            setFilters([]);
            setMobileTablesOpen(false);
          }}
        />
      </div>

      {/* ---- Right content: data view ---- */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-bg-surface">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 md:hidden">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setMobileTablesOpen(true)}
          >
            <Table2 size={13} />
            Tables
          </Button>
          {selectedTable && (
            <Badge variant="secondary" className="max-w-[60vw] truncate">
              <span className="truncate font-mono">{selectedTable}</span>
            </Badge>
          )}
          {tableList.length > 0 && (
            <span className="ml-auto text-[11px] text-text-tertiary">
              {tableList.length} tables
            </span>
          )}
        </div>
        {selectedTable ? (
          <>
            {/* Toolbar */}
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <h3 className="truncate font-mono text-[13px] font-semibold text-text-primary">
                  {selectedTable}
                </h3>
                <Badge variant="outline" className="text-[10px]">
                  {totalCount} rows
                </Badge>
                {loading && (
                  <Loader2
                    size={12}
                    className="animate-spin text-text-tertiary"
                  />
                )}
                {dataError && (
                  <Badge variant="destructive" className="max-w-[22rem]">
                    <span className="truncate">{dataError}</span>
                  </Badge>
                )}
                {activeRuntime && (
                  <Badge
                    variant="outline"
                    className="hidden text-[10px] font-mono lg:inline-flex"
                  >
                    {activeRuntime.platform}:
                    {activeRuntime.runtimeId.slice(0, 8)}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1 overflow-x-auto">
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
              <div className="flex items-center gap-1.5 border-b border-border bg-bg-base px-3 py-1.5">
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
            <div className="border-b border-border px-3 py-1.5">
              <DataFilters
                fields={columns}
                filters={filters}
                onFiltersChange={setFilters}
              />
            </div>

            <div className="mx-3 mb-3 mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-bg-base">
              <Tabs
                value={activePanelTab}
                onValueChange={(value) =>
                  setActivePanelTab(value as "data" | "schema" | "indexes")
                }
                className="flex min-h-0 flex-1 flex-col"
              >
                <div className="border-b border-border bg-bg-surface px-3">
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

                <TabsContent
                  value="data"
                  forceMount
                  className={cn(
                    "flex-1 min-h-0 bg-transparent",
                    activePanelTab !== "data" && "hidden"
                  )}
                >
                  <div className="flex h-full">
                    <div className="min-w-0 flex-1 p-2">
                      {rows.length === 0 ? (
                        <EmptyState
                          icon={Database}
                          title="No data"
                          description={
                            filters.length > 0
                              ? "No rows match the current filters."
                              : "This table is empty."
                          }
                          className="h-full rounded-md border border-border bg-bg-base"
                        />
                      ) : (
                        <DataTable
                          key={`${selectedTable}:${rows.length}`}
                          columns={columns}
                          rows={rows}
                          selectedRowId={selectedDocId}
                          selectedRowIds={selectedRowIds}
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
                          className="h-full rounded-md border border-border bg-bg-base"
                        />
                      )}
                    </div>

                    {liveSelectedDoc && (
                      <DocumentPanel
                        document={liveSelectedDoc}
                        onClose={() => setSelectedRowIds([])}
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

                <TabsContent
                  value="schema"
                  forceMount
                  className={cn(
                    "flex-1 min-h-0 bg-transparent",
                    activePanelTab !== "schema" && "hidden"
                  )}
                >
                  <SchemaViewer schema={currentSchema} className="p-2" />
                </TabsContent>

                <TabsContent
                  value="indexes"
                  forceMount
                  className={cn(
                    "flex-1 min-h-0 bg-transparent",
                    activePanelTab !== "indexes" && "hidden"
                  )}
                >
                  <IndexesViewer indexes={currentSchema?.indexes ?? []} className="p-2" />
                </TabsContent>
              </Tabs>
            </div>
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
            ? {
                [fieldEditState.field]: toEditableCellText(
                  fieldEditState.field,
                  fieldEditState.value
                )
              }
            : undefined
        }
        hint="Primitive values, arrays, objects, null, true and false are all supported."
        requireDirty
        onSubmit={async (document) => {
          if (!fieldEditState) {
            throw new Error("No field selected.");
          }
          const submittedValue = document[fieldEditState.field];
          const serializedValue =
            typeof submittedValue === "string"
              ? submittedValue
              : stringifyEditableValue(submittedValue);
          await handleFieldEdit(
            fieldEditState.id,
            fieldEditState.field,
            parseEditableCellValue(
              fieldEditState.field,
              serializedValue,
              fieldEditState.value
            )
          );
        }}
      />

      <Dialog open={mobileTablesOpen} onOpenChange={setMobileTablesOpen}>
        <DialogContent className="max-w-[calc(100%-1.5rem)] p-0 sm:max-w-lg">
          <TableDirectory
            filteredTables={filteredTables}
            targetAvailable={Boolean(targetRuntimeId)}
            usingProjectTarget={usingProjectTarget}
            schemaLoading={schemaSubscription.loading}
            hasSchemaData={Boolean(schemaSubscription.data)}
            selectedTable={selectedTable}
            tableCount={tableList.length}
            tableSearch={tableSearch}
            onTableSearchChange={setTableSearch}
            onSelectTable={(tableName) => {
              setSelectedTable(tableName);
              setSelectedRowIds([]);
              setFilters([]);
              setMobileTablesOpen(false);
            }}
            className="max-h-[75vh]"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TableDirectory({
  filteredTables,
  targetAvailable,
  usingProjectTarget,
  schemaLoading,
  hasSchemaData,
  selectedTable,
  tableCount,
  tableSearch,
  onTableSearchChange,
  onSelectTable,
  className
}: {
  filteredTables: Array<{
    name: string;
    documentCount: number;
  }>;
  targetAvailable: boolean;
  usingProjectTarget: boolean;
  schemaLoading: boolean;
  hasSchemaData: boolean;
  selectedTable: string | null;
  tableCount: number;
  tableSearch: string;
  onTableSearchChange: (value: string) => void;
  onSelectTable: (tableName: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-bg-surface",
        className
      )}
    >
      <div className="border-b border-border px-3 py-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-[13px] font-semibold text-text-primary">
            Tables
          </h2>
          <div className="flex items-center gap-2">
            {schemaLoading && (
              <Loader2 size={12} className="animate-spin text-text-tertiary" />
            )}
            {hasSchemaData && <span className="text-[11px] text-text-tertiary">{tableCount}</span>}
          </div>
        </div>
        <div className="relative">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <Input
            placeholder="Search tables..."
            value={tableSearch}
            onChange={(e) => onTableSearchChange(e.target.value)}
            className="h-8 rounded-md border-border bg-bg-base pl-8 text-[12px]"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-1.5 p-2.5">
          {filteredTables.length === 0 ? (
            <div className="py-10 text-center">
              <Database size={20} className="mx-auto mb-2 text-text-tertiary" />
              <p className="text-[11px] text-text-tertiary">
                {targetAvailable
                  ? "No tables found"
                  : usingProjectTarget
                    ? "Project target unavailable"
                    : "Connect a runtime or configure a project target"}
              </p>
            </div>
          ) : (
            filteredTables.map((table) => {
              const isActive = selectedTable === table.name;
              return (
                <button
                  key={table.name}
                  type="button"
                  onClick={() => onSelectTable(table.name)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md border px-2.5 py-2.5 text-left transition-colors",
                    isActive
                      ? "border-border-active bg-bg-base text-text-primary"
                      : "border-transparent bg-transparent text-text-secondary hover:border-border hover:bg-bg-base hover:text-text-primary"
                  )}
                >
                  <Table2 size={13} className="shrink-0 text-text-tertiary" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-[12px]">
                      {table.name}
                    </div>
                    <div className="text-[10px] text-text-tertiary">
                      {table.documentCount} row
                      {table.documentCount === 1 ? "" : "s"}
                    </div>
                  </div>
                  <Badge
                    variant={isActive ? "outline" : "secondary"}
                    className="shrink-0 px-1.5 py-0 text-[9px]"
                  >
                    {table.documentCount}
                  </Badge>
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>

      <div className="border-t border-border px-3 py-2 text-[11px] text-text-tertiary">
        {tableCount} tables
      </div>
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

function shallowEqualRows(
  left: Record<string, unknown>[],
  right: Record<string, unknown>[]
): boolean {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (JSON.stringify(left[index]) !== JSON.stringify(right[index])) {
      return false;
    }
  }
  return true;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string") {
      return value;
    }
  }
  return null;
}

function stringifyEditableValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined) {
    return "";
  }
  return JSON.stringify(value);
}
