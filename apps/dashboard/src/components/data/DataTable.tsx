import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTrackChanges } from "@/hooks";
import { CellEditor } from "./CellEditor";
import { useMemo, useState } from "react";

interface DataTableProps {
  columns: string[];
  rows: Record<string, unknown>[];
  selectedRowId?: string | null;
  selectedRowIds?: string[];
  onRowClick?: (row: Record<string, unknown>) => void;
  onToggleRowSelection?: (rowId: string) => void;
  onToggleAllRows?: (rowIds: string[], checked: boolean) => void;
  onCellEdit?: (rowId: string, field: string, value: unknown) => void;
  className?: string;
}

export function DataTable({
  columns,
  rows,
  selectedRowId,
  selectedRowIds = [],
  onRowClick,
  onToggleRowSelection,
  onToggleAllRows,
  onCellEdit,
  className
}: DataTableProps) {
  const [editingCell, setEditingCell] = useState<{
    rowId: string;
    field: string;
    value: unknown;
  } | null>(null);

  // Track per-row changes for highlight animations
  const { isChanged, isNew } = useTrackChanges(
    rows,
    (row) => getRowId(row, rows.indexOf(row)),
    (row) => JSON.stringify(row)
  );
  const visibleRowIds = useMemo(
    () => rows.map((row, idx) => getRowId(row, idx)),
    [rows]
  );
  const selectedIds = useMemo(() => new Set(selectedRowIds), [selectedRowIds]);
  const allVisibleSelected =
    visibleRowIds.length > 0 &&
    visibleRowIds.every((id) => selectedIds.has(id));

  return (
    <ScrollArea className={cn("w-full", className)}>
      <div className="min-w-full">
        {/* Header */}
        <div className="flex border-b border-border bg-bg-surface/50 sticky top-0 z-10">
          <div className="flex w-10 shrink-0 items-center justify-center border-r border-border px-2 py-2">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={(e) =>
                onToggleAllRows?.(visibleRowIds, e.currentTarget.checked)
              }
              className="size-3.5 rounded border-border bg-bg-base accent-[var(--color-accent)]"
              aria-label="Select all visible rows"
            />
          </div>
          {columns.map((col) => (
            <div
              key={col}
              className="flex-shrink-0 w-48 px-3 py-2 text-[10px] uppercase tracking-wider font-semibold text-text-tertiary border-r border-border last:border-r-0"
            >
              {col}
            </div>
          ))}
        </div>

        {/* Rows */}
        <div>
          {rows.map((row, idx) => {
            const rowId = getRowId(row, idx);
            const isSelected = selectedRowId === rowId;
            const rowChanged = isChanged(rowId);
            const rowNew = isNew(rowId);

            return (
              <div
                key={rowId}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  "flex border-b border-border transition-colors cursor-pointer",
                  isSelected
                    ? "bg-accent/8 border-l-2 border-l-accent"
                    : "hover:bg-bg-elevated/50",
                  rowChanged && "animate-highlight",
                  rowNew && "animate-fade-in"
                )}
              >
                <div
                  className="flex w-10 shrink-0 items-center justify-center border-r border-border px-2 py-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(rowId)}
                    onChange={() => onToggleRowSelection?.(rowId)}
                    className="size-3.5 rounded border-border bg-bg-base accent-[var(--color-accent)]"
                    aria-label={`Select row ${rowId}`}
                  />
                </div>
                {columns.map((col) => (
                  <div
                    key={col}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (!onCellEdit) return;
                      setEditingCell({
                        rowId,
                        field: col,
                        value: row[col]
                      });
                    }}
                    className="flex-shrink-0 w-48 px-3 py-2 text-[12px] text-text-secondary font-mono truncate border-r border-border last:border-r-0"
                  >
                    {editingCell?.rowId === rowId &&
                    editingCell.field === col ? (
                      <CellEditor
                        field={col}
                        value={editingCell.value}
                        onCancel={() => setEditingCell(null)}
                        onSave={(value) => {
                          onCellEdit?.(rowId, col, value);
                          setEditingCell(null);
                        }}
                      />
                    ) : (
                      <CellValue value={row[col]} />
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
}

/* ------------------------------------------------------------------ */
/*  Cell value renderer                                                */
/* ------------------------------------------------------------------ */

function CellValue({ value }: { value: unknown }) {
  if (value === null) {
    return <span className="text-text-tertiary italic">null</span>;
  }
  if (value === undefined) {
    return <span className="text-text-tertiary italic">—</span>;
  }
  if (typeof value === "boolean") {
    return (
      <span className={value ? "text-success" : "text-text-tertiary"}>
        {String(value)}
      </span>
    );
  }
  if (typeof value === "number") {
    return <span className="text-info">{value}</span>;
  }
  if (typeof value === "string") {
    if (value.length > 50) {
      return (
        <span className="text-text-secondary" title={value}>
          "{value.slice(0, 50)}..."
        </span>
      );
    }
    return <span className="text-text-secondary">"{value}"</span>;
  }
  if (typeof value === "object") {
    return (
      <span className="text-text-tertiary">
        {Array.isArray(value)
          ? `[${value.length} items]`
          : `{${Object.keys(value).length} keys}`}
      </span>
    );
  }
  if (typeof value === "bigint") {
    return <span className="text-text-secondary">{String(value)}</span>;
  }
  return <span className="text-text-secondary">—</span>;
}

function getRowId(row: Record<string, unknown>, idx: number): string {
  const candidate = row._id ?? row.id;
  if (
    typeof candidate === "string" ||
    typeof candidate === "number" ||
    typeof candidate === "bigint"
  ) {
    return String(candidate);
  }
  return `row-${idx}`;
}
