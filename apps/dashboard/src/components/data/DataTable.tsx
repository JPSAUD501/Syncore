import { useMemo, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTrackChanges } from "@/hooks";
import { formatCellPreview, isDateLikeField } from "@/lib/dataValue";
import { cn } from "@/lib/utils";
import { CellEditor } from "./CellEditor";

interface DataTableProps {
  columns: string[];
  rows: Record<string, unknown>[];
  selectedRowId?: string | null;
  selectedRowIds?: string[];
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

  const rowIds = useMemo(
    () => rows.map((row, idx) => getRowId(row, idx)),
    [rows]
  );

  const { isChanged, isNew, getChangePulse, getNewPulse } = useTrackChanges(
    rows,
    (_row, index) => rowIds[index] ?? `row-${index}`,
    (row) => JSON.stringify(row)
  );

  const visibleRowIds = useMemo(() => rowIds, [rowIds]);
  const selectedIds = useMemo(() => new Set(selectedRowIds), [selectedRowIds]);
  const allVisibleSelected =
    visibleRowIds.length > 0 &&
    visibleRowIds.every((id) => selectedIds.has(id));

  return (
    <ScrollArea className={cn("h-full w-full bg-bg-base", className)}>
      <div className="min-w-full w-max border-r border-border bg-bg-base">
        <div className="sticky top-0 z-10 flex border-b border-border bg-bg-surface">
          <div className="flex h-9 w-10 shrink-0 items-center justify-center border-r border-border px-2">
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
              className={cn(
                "h-9 shrink-0 border-r border-border px-3 py-2 text-left text-[11px] font-semibold text-text-tertiary last:border-r-0",
                getColumnWidthClass(col)
              )}
            >
              {col}
            </div>
          ))}
        </div>

        <div className="bg-bg-base">
          {rows.map((row, idx) => {
            const rowId = getRowId(row, idx);
            const isSelected = selectedRowId === rowId;
            const isChecked = selectedIds.has(rowId);
            const rowChanged = isChanged(rowId);
            const rowNew = isNew(rowId);
            const changePulse = getChangePulse(rowId);
            const newPulse = getNewPulse(rowId);

            return (
              <div
                key={rowId}
                className={cn(
                  "flex border-b border-border/80 bg-bg-base transition-colors",
                  isSelected
                    ? "bg-bg-surface shadow-[inset_2px_0_0_0_var(--color-accent)]"
                    : isChecked
                      ? "bg-bg-surface/70"
                      : "hover:bg-bg-surface/45",
                  rowChanged &&
                    (changePulse % 2 === 0
                      ? "animate-highlight-a"
                      : "animate-highlight-b"),
                  rowNew &&
                    (newPulse % 2 === 0
                      ? "animate-fade-in-a"
                      : "animate-fade-in-b")
                )}
              >
                <div
                  className="flex min-h-11 w-10 shrink-0 items-center justify-center border-r border-border px-2 py-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
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
                      if (!onCellEdit) {
                        return;
                      }
                      setEditingCell({
                        rowId,
                        field: col,
                        value: row[col]
                      });
                    }}
                    className={cn(
                      "flex min-h-11 shrink-0 items-center border-r border-border px-3 py-2 font-mono text-[12px] text-text-secondary last:border-r-0",
                      getColumnWidthClass(col)
                    )}
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
                      <CellValue field={col} value={row[col]} />
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

function CellValue({
  field,
  value
}: {
  field: string;
  value: unknown;
}) {
  const preview = formatCellPreview(field, value);

  if (preview.kind === "date") {
    return (
      <span
        className="block truncate tabular-nums text-[11px] text-amber-100"
        title={preview.title ? `${preview.text}\n${preview.title}` : preview.text}
      >
        {preview.text}
      </span>
    );
  }

  if (value === null) {
    return <span className="text-text-tertiary italic">null</span>;
  }
  if (value === undefined) {
    return <span className="text-text-tertiary italic">-</span>;
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
    if (value.length > 72) {
      return (
        <span className="block truncate text-text-secondary" title={value}>
          "{value}"
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
  return <span className="text-text-secondary">-</span>;
}

function getColumnWidthClass(column: string): string {
  if (column === "_id" || column === "id") {
    return "w-[18rem]";
  }
  if (isDateLikeField(column) || column === "_creationTime") {
    return "w-[16rem]";
  }
  return "w-56";
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
