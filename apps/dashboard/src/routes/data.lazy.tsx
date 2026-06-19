import { createLazyFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { Database, Search, Table2, Layers, Key, Loader2 } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getDocumentId } from "@/lib/dataValue";
import {
  createReferenceOptions,
  type ReferenceFieldOptions
} from "@/lib/dataReferences";
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
import { EmptyState, InfoTooltip } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { usePreferredTarget } from "@/hooks";
import { useDevtoolsSubscription } from "@/hooks/useReactiveData";
import { getPublicRuntimeId, useActiveRuntime } from "@/lib/store";
import { sendRequest } from "@/lib/store";
import { parseEditableCellValue, toEditableCellText } from "@/lib/dataValue";
import {
  assertDocument,
  downloadJson,
  stripSystemFields
} from "@/lib/documents";
import { stableStringify } from "@/lib/stable";
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
  const [activePanelTab, setActivePanelTab] = useState<
    "data" | "schema" | "indexes"
  >("data");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState<DataFilter[]>([]);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [pendingSelectedRowId, setPendingSelectedRowId] = useState<
    string | null
  >(null);
  const [panelDocId, setPanelDocId] = useState<string | null>(null);
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
  const [databaseImportOpen, setDatabaseImportOpen] = useState(false);
  const [importSeedText, setImportSeedText] = useState<string | undefined>(
    undefined
  );
  const [mobileTablesOpen, setMobileTablesOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [showMissingReferencesOnly, setShowMissingReferencesOnly] =
    useState(false);
  const [referenceRowsByTable, setReferenceRowsByTable] = useState<
    Record<string, Record<string, unknown>[]>
  >({});

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

  const currentSchema = useMemo(
    () => tableList.find((t) => t.name === selectedTable) ?? null,
    [tableList, selectedTable]
  );

  const referenceFields = useMemo<Record<string, ReferenceFieldOptions>>(() => {
    const entries =
      currentSchema?.fields
        .map((field) =>
          createReferenceOptions(
            field,
            field.referenceTable
              ? (referenceRowsByTable[field.referenceTable] ?? [])
              : []
          )
        )
        .filter((entry): entry is ReferenceFieldOptions => Boolean(entry)) ??
      [];
    return Object.fromEntries(
      entries.map((entry) => [entry.field.name, entry])
    );
  }, [currentSchema, referenceRowsByTable]);

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

  useEffect(() => {
    if (!targetRuntimeId || !currentSchema) {
      setReferenceRowsByTable({});
      return;
    }
    const referenceTableNames = Array.from(
      new Set(
        currentSchema.fields
          .map((field) => field.referenceTable)
          .filter((tableName): tableName is string => Boolean(tableName))
      )
    );
    if (referenceTableNames.length === 0) {
      setReferenceRowsByTable({});
      return;
    }

    let cancelled = false;
    void Promise.all(
      referenceTableNames.map(async (tableName) => {
        const result = await sendRequest(
          {
            kind: "data.referenceOptions",
            table: tableName,
            limit: 100,
            offset: 0
          },
          { targetRuntimeId }
        );
        if (result.kind !== "data.referenceOptions.result" || result.error) {
          return [tableName, []] as const;
        }
        return [tableName, result.rows] as const;
      })
    )
      .then((entries) => {
        if (cancelled) {
          return;
        }
        setReferenceRowsByTable(Object.fromEntries(entries));
      })
      .catch(() => {
        if (!cancelled) {
          setReferenceRowsByTable({});
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentSchema, targetRuntimeId]);

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
        await sendRequest(
          {
            kind: "data.delete",
            table: selectedTable,
            id
          },
          { targetRuntimeId }
        );
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
          sendRequest(
            {
              kind: "data.delete",
              table: selectedTable,
              id
            },
            { targetRuntimeId }
          )
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
      validateDocumentReferences(referenceFields, document);
      const res = await sendRequest(
        {
          kind: "data.insert",
          table: selectedTable,
          document
        },
        { targetRuntimeId }
      );
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
    [pushToast, referenceFields, selectedTable, targetRuntimeId]
  );

  const handlePatch = useCallback(
    async (id: string, fields: Record<string, unknown>) => {
      if (!targetRuntimeId || !selectedTable) return;
      validateDocumentReferences(referenceFields, fields);
      const res = await sendRequest(
        {
          kind: "data.patch",
          table: selectedTable,
          id,
          fields
        },
        { targetRuntimeId }
      );
      if (res.kind === "data.mutate.result" && !res.success) {
        throw new Error(res.error ?? "Failed to update document.");
      }
      pushToast({
        tone: "success",
        title: "Document updated",
        description: `${id} was updated.`
      });
    },
    [pushToast, referenceFields, selectedTable, targetRuntimeId]
  );

  const handleFieldEdit = useCallback(
    async (id: string, field: string, value: unknown) => {
      try {
        validateReferenceValue(referenceFields[field], value);
        await handlePatch(id, { [field]: value });
        setFieldEditState(null);
      } catch (err) {
        pushToast({
          tone: "error",
          title: "Field update failed",
          description:
            err instanceof Error ? err.message : "Failed to update field."
        });
      }
    },
    [handlePatch, pushToast, referenceFields]
  );

  const handleImport = useCallback(
    async (documents: Record<string, unknown>[]) => {
      for (const document of documents) {
        validateDocumentReferences(referenceFields, document);
        await handleInsert(document, { silent: true });
      }
      pushToast({
        tone: "success",
        title: "Import complete",
        description: `${documents.length} document${documents.length === 1 ? "" : "s"} imported into ${selectedTable}.`
      });
    },
    [handleInsert, pushToast, referenceFields, selectedTable]
  );

  const handleExport = useCallback(() => {
    if (!selectedTable) return;
    downloadJson(rows, `${selectedTable}.json`);
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
    downloadJson(selectedRows, `${selectedTable}-selection.json`);
    pushToast({
      tone: "info",
      title: "Selection exported",
      description: `${selectedRows.length} selected row${selectedRows.length === 1 ? "" : "s"} exported.`
    });
  }, [pushToast, rows, selectedRowIds, selectedTable]);

  const handleExportDatabase = useCallback(async () => {
    if (!targetRuntimeId || tableList.length === 0) return;
    const res = await sendRequest(
      {
        kind: "data.export",
        tables: tableList.map((table) => table.name)
      },
      { targetRuntimeId }
    );
    if (res.kind !== "data.export.result") {
      throw new Error("Unexpected export response.");
    }
    if (res.error) {
      throw new Error(res.error);
    }

    const payload = {
      format: "syncore.devtools.export.v1",
      exportedAt: new Date().toISOString(),
      tables: res.tables
    };
    downloadJson(payload, "syncore-database-export.json");
    const totalRows = res.tables.reduce(
      (total, table) => total + table.rows.length,
      0
    );
    pushToast({
      tone: "info",
      title: "Database export ready",
      description: `${res.tables.length} table${res.tables.length === 1 ? "" : "s"} and ${totalRows} row${totalRows === 1 ? "" : "s"} exported.`
    });
  }, [pushToast, tableList, targetRuntimeId]);

  const handleImportDatabase = useCallback(
    async (
      tables: Array<{ name: string; rows: Record<string, unknown>[] }>
    ) => {
      if (!targetRuntimeId) return;
      let importedRows = 0;
      for (const table of tables) {
        for (const row of table.rows) {
          const res = await sendRequest(
            {
              kind: "data.insert",
              table: table.name,
              document: stripSystemFields(row)
            },
            { targetRuntimeId }
          );
          if (res.kind === "data.mutate.result" && !res.success) {
            throw new Error(
              res.error ?? `Failed to import into ${table.name}.`
            );
          }
          importedRows += 1;
        }
      }
      pushToast({
        tone: "success",
        title: "Database import complete",
        description: `${importedRows} row${importedRows === 1 ? "" : "s"} imported into ${tables.length} table${tables.length === 1 ? "" : "s"}.`
      });
    },
    [pushToast, targetRuntimeId]
  );

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

  const selectedDocId = panelDocId;

  const liveSelectedDoc = useMemo(() => {
    if (!panelDocId) return null;
    return rows.find((row) => getDocumentId(row) === panelDocId) ?? null;
  }, [rows, panelDocId]);

  useEffect(() => {
    if (panelDocId && !liveSelectedDoc) {
      setPanelDocId(null);
    }
  }, [liveSelectedDoc, panelDocId]);

  useEffect(() => {
    const liveIds = new Set(rows.map((row) => getDocumentId(row)));
    setSelectedRowIds((current) => current.filter((id) => liveIds.has(id)));
  }, [rows]);

  // When a pending reference-navigation row appears, open it in the panel
  useEffect(() => {
    if (!pendingSelectedRowId) return;
    const found = rows.some(
      (row) => getDocumentId(row) === pendingSelectedRowId
    );
    if (!found) return;
    setPanelDocId(pendingSelectedRowId);
    setPendingSelectedRowId(null);
  }, [pendingSelectedRowId, rows]);

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

  const rowsWithMissingReferences = useMemo(
    () => rows.filter((row) => hasMissingReference(row, referenceFields)),
    [referenceFields, rows]
  );
  const visibleRows = showMissingReferencesOnly
    ? rowsWithMissingReferences
    : rows;

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
            setPanelDocId(null);
            setPendingSelectedRowId(null);
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
              {/* Table name — hidden on mobile since the row above already shows it */}
              <div className="hidden min-w-0 flex-1 items-center gap-2 sm:flex">
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
                  <Badge variant="destructive" className="max-w-88">
                    <span className="truncate">{dataError}</span>
                  </Badge>
                )}
                {activeRuntime && (
                  <Badge
                    variant="outline"
                    className="hidden text-[10px] font-mono lg:inline-flex"
                  >
                    {activeRuntime.platform}:
                    {getPublicRuntimeId(activeRuntime.runtimeId)}
                  </Badge>
                )}
              </div>
              {/* Mobile: compact status — table name shown in the row above */}
              <div className="flex min-w-0 flex-1 items-center gap-2 sm:hidden">
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
                  <Badge variant="destructive" className="max-w-36">
                    <span className="truncate">{dataError}</span>
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
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
                  <Download size={11} />
                  Import
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  className="gap-1"
                  onClick={handleExport}
                  disabled={rows.length === 0}
                >
                  <Upload size={11} />
                  Export
                </Button>

                <div className="mx-1 h-4 w-px bg-border" />

                <Button
                  variant="ghost"
                  size="xs"
                  className="gap-1"
                  onClick={() => setDatabaseImportOpen(true)}
                  disabled={!targetRuntimeId}
                  title="Import all tables from a database export file"
                >
                  <Database size={11} />
                  <Download size={11} />
                  <span className="hidden md:inline">Import DB</span>
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  className="gap-1"
                  onClick={() => {
                    void handleExportDatabase().catch((err) => {
                      pushToast({
                        tone: "error",
                        title: "Database export failed",
                        description:
                          err instanceof Error ? err.message : "Unknown error"
                      });
                    });
                  }}
                  disabled={!targetRuntimeId || tableList.length === 0}
                  title="Export all tables as a single file"
                >
                  <Database size={11} />
                  <Upload size={11} />
                  <span className="hidden md:inline">Export DB</span>
                </Button>

                <div className="mx-1 h-4 w-px bg-border" />

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
                <Button
                  variant="ghost"
                  size="xs"
                  className="gap-1 hidden sm:inline-flex"
                  onClick={() => setShortcutsOpen(true)}
                >
                  <Keyboard size={11} />
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
              {Object.keys(referenceFields).length > 0 && (
                <div className="mt-1.5 flex items-center gap-2">
                  <Button
                    variant={showMissingReferencesOnly ? "secondary" : "ghost"}
                    size="xs"
                    onClick={() =>
                      setShowMissingReferencesOnly((current) => !current)
                    }
                    disabled={rowsWithMissingReferences.length === 0}
                  >
                    Missing refs
                    {rowsWithMissingReferences.length > 0 && (
                      <Badge
                        variant="destructive"
                        className="ml-1 px-1 py-0 text-[9px]"
                      >
                        {rowsWithMissingReferences.length}
                      </Badge>
                    )}
                  </Button>
                </div>
              )}
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
                      <InfoTooltip termSlug="schema.indexes" side="bottom">
                        <span>Indexes</span>
                      </InfoTooltip>
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
                      {loading && visibleRows.length === 0 ? (
                        <DataTableSkeleton columnCount={Math.min(columns.length, 6)} />
                      ) : visibleRows.length === 0 ? (
                        <EmptyState
                          icon={Database}
                          title="No data"
                          description={
                            showMissingReferencesOnly
                              ? "No rows have missing references."
                              : filters.length > 0
                                ? "No rows match the current filters."
                                : "This table is empty."
                          }
                          className="h-full rounded-md border border-border bg-bg-base"
                        />
                      ) : (
                        <DataTable
                          key={selectedTable}
                          columns={columns}
                          rows={visibleRows}
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
                          onOpenReference={(tableName, id) => {
                            setSelectedTable(tableName);
                            setFilters([
                              { field: "_id", operator: "eq", value: id }
                            ]);
                            setSelectedRowIds([]);
                            setPanelDocId(null);
                            setPendingSelectedRowId(id);
                            setShowMissingReferencesOnly(false);
                          }}
                          onRowClick={(rowId) => setPanelDocId(rowId)}
                          referenceFields={referenceFields}
                          className="h-full rounded-md border border-border bg-bg-base"
                        />
                      )}
                    </div>

                    <AnimatePresence>
                      {liveSelectedDoc && (
                        <motion.div
                          key="document-panel"
                          initial={{ opacity: 0, x: 16 }}
                          animate={{
                            opacity: 1,
                            x: 0,
                            transition: { duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }
                          }}
                          exit={{
                            opacity: 0,
                            x: 16,
                            transition: { duration: 0.16, ease: [0.22, 0.61, 0.36, 1] }
                          }}
                          className="fixed inset-0 z-50 md:static md:z-auto md:shrink-0 md:self-stretch"
                        >
                          <DocumentPanel
                            document={liveSelectedDoc}
                            onClose={() => setPanelDocId(null)}
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
                            referenceFields={referenceFields}
                            className="w-full h-full border-l-0 md:w-96 md:border-l"
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
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
                  <IndexesViewer
                    indexes={currentSchema?.indexes ?? []}
                    className="p-2"
                  />
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

      <ImportDatabaseDialog
        open={databaseImportOpen}
        onOpenChange={setDatabaseImportOpen}
        onImport={handleImportDatabase}
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
              setPanelDocId(null);
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
            {hasSchemaData && (
              <span className="text-[11px] text-text-tertiary">
                {tableCount}
              </span>
            )}
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
                    ? "Selected Project Target runtime unavailable"
                    : "Connect a runtime"}
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
                  </div>
                  <span className="shrink-0 text-[10px] text-text-tertiary tabular-nums">
                    {table.documentCount}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function ImportDatabaseDialog({
  open,
  onOpenChange,
  onImport
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (
    tables: Array<{ name: string; rows: Record<string, unknown>[] }>
  ) => Promise<void>;
}) {
  const [text, setText] = useState(
    '{\n  "format": "syncore.devtools.export.v1",\n  "tables": []\n}'
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setText(
        '{\n  "format": "syncore.devtools.export.v1",\n  "tables": []\n}'
      );
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const handleImport = async () => {
    setError(null);
    let tables: Array<{ name: string; rows: Record<string, unknown>[] }>;
    try {
      tables = parseDatabaseImportText(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid import payload.");
      return;
    }

    setSubmitting(true);
    try {
      await onImport(tables);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Database</DialogTitle>
          <DialogDescription>
            Paste a Syncore database export or a JSON object whose keys are
            table names and values are document arrays.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border border-border bg-bg-base/70 p-2">
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              spellCheck={false}
              className="min-h-80 w-full resize-y bg-transparent px-2 py-1 font-mono text-[12px] leading-6 text-text-code outline-none placeholder:text-text-tertiary"
              placeholder='{
  "tasks": [{ "text": "Ship" }],
  "projects": [{ "name": "Syncore" }]
}'
            />
          </div>

          <div className="rounded-md border border-accent/15 bg-accent/5 px-3 py-2 text-[11px] text-text-secondary">
            System fields like{" "}
            <span className="font-mono text-text-primary">_id</span> and{" "}
            <span className="font-mono text-text-primary">_creationTime</span>{" "}
            are ignored on import, matching single-table imports.
          </div>

          {error && (
            <div className="rounded-md border border-error/20 bg-error/5 px-3 py-2 text-[11px] text-error">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={() => void handleImport()} disabled={submitting}>
            {submitting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Upload size={14} />
            )}
            Import database
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function parseDatabaseImportText(
  text: string
): Array<{ name: string; rows: Record<string, unknown>[] }> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Paste a database export or table map to import.");
  }
  const parsed = JSON.parse(trimmed) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Database import payload must be a JSON object.");
  }
  const payload = parsed as Record<string, unknown>;

  if (Array.isArray(payload.tables)) {
    return payload.tables.map((entry, index) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        throw new Error(`tables[${index}] must be an object.`);
      }
      const table = entry as Record<string, unknown>;
      if (typeof table.name !== "string" || !table.name.trim()) {
        throw new Error(`tables[${index}].name must be a table name.`);
      }
      if (!Array.isArray(table.rows)) {
        throw new Error(`tables[${index}].rows must be an array.`);
      }
      return {
        name: table.name,
        rows: table.rows.map((row, rowIndex) =>
          assertDocument(
            row,
            `${table.name}[${rowIndex}] must be a JSON object.`
          )
        )
      };
    });
  }

  return Object.entries(payload).map(([name, value]) => {
    if (!Array.isArray(value)) {
      throw new Error(`${name} must be an array of documents.`);
    }
    return {
      name,
      rows: value.map((row, rowIndex) =>
        assertDocument(row, `${name}[${rowIndex}] must be a JSON object.`)
      )
    };
  });
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
    if (stableStringify(left[index]) !== stableStringify(right[index])) {
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
  return stableStringify(value);
}

function validateReferenceValue(
  reference: ReferenceFieldOptions | undefined,
  value: unknown
): void {
  if (!reference) {
    return;
  }
  if (
    (value === undefined || value === null || value === "") &&
    reference.field.optional
  ) {
    return;
  }
  if (typeof value !== "string") {
    throw new Error(
      `${reference.field.name} must reference a row from ${reference.tableName}.`
    );
  }
  if (!reference.options.some((option) => option.id === value)) {
    throw new Error(
      `${value} does not exist in referenced table ${reference.tableName}.`
    );
  }
}

function validateDocumentReferences(
  references: Record<string, ReferenceFieldOptions>,
  document: Record<string, unknown>
): void {
  for (const [field, reference] of Object.entries(references)) {
    if (field in document) {
      validateReferenceValue(reference, document[field]);
    }
  }
}

function hasMissingReference(
  row: Record<string, unknown>,
  references: Record<string, ReferenceFieldOptions>
): boolean {
  return Object.entries(references).some(([field, reference]) => {
    const value = row[field];
    if (
      (value === undefined || value === null || value === "") &&
      reference.field.optional
    ) {
      return false;
    }
    return (
      typeof value === "string" &&
      !reference.options.some((option) => option.id === value)
    );
  });
}

/** Loading placeholder for the data table — distinct from the empty state. */
function DataTableSkeleton({ columnCount = 5 }: { columnCount?: number }) {
  return (
    <div className="h-full overflow-hidden rounded-md border border-border bg-bg-base">
      <div className="flex h-9 border-b border-border bg-bg-surface">
        <div className="w-16 shrink-0 border-r border-border" />
        {Array.from({ length: columnCount }).map((_, i) => (
          <div
            key={i}
            className="h-9 flex-1 border-r border-border px-3 py-2 last:border-r-0"
          >
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
      {Array.from({ length: 10 }).map((_, row) => (
        <div key={row} className="flex border-b border-border/60">
          <div className="flex w-16 shrink-0 items-center justify-center border-r border-border px-2">
            <Skeleton className="size-3.5 rounded-sm" />
          </div>
          {Array.from({ length: columnCount }).map((_, col) => (
            <div
              key={col}
              className="flex min-h-11 flex-1 items-center border-r border-border px-3 py-2 last:border-r-0"
            >
              <Skeleton className="h-3.5 w-full max-w-[12rem]" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
