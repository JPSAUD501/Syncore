import { useMemo, useState } from "react";
import { Popover } from "radix-ui";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getReferenceDisplay, type ReferenceFieldOptions } from "@/lib/dataReferences";
import { useTrackChanges } from "@/hooks";
import { formatCellPreview, isDateLikeField, isColorLikeField, formatReadableDate } from "@/lib/dataValue";
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
  referenceFields?: Record<string, ReferenceFieldOptions>;
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
  referenceFields,
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
            <RowCheckbox
              checked={allVisibleSelected}
              onChange={(checked) => onToggleAllRows?.(visibleRowIds, checked)}
              ariaLabel="Select all visible rows"
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
                  <RowCheckbox
                    checked={isChecked}
                    onChange={() => onToggleRowSelection?.(rowId)}
                    ariaLabel={`Select row ${rowId}`}
                  />
                </div>
                {columns.map((col) => {
                  const isEditingThisCell =
                    editingCell?.rowId === rowId && editingCell.field === col;
                  return (
                    <Popover.Root
                      key={col}
                      open={isEditingThisCell}
                      onOpenChange={(open) => {
                        if (!open) setEditingCell(null);
                      }}
                    >
                      <Popover.Anchor asChild>
                        <div
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            if (!onCellEdit) return;
                            setEditingCell({ rowId, field: col, value: row[col] });
                          }}
                          className={cn(
                            "flex min-h-11 shrink-0 cursor-default items-center border-r border-border px-3 py-2 font-mono text-[12px] text-text-secondary last:border-r-0 select-none",
                            isEditingThisCell && "bg-bg-surface ring-1 ring-inset ring-accent/40",
                            getColumnWidthClass(col)
                          )}
                        >
                          <div className="min-w-0 w-full">
                            <CellValue
                              field={col}
                              value={row[col]}
                              reference={referenceFields?.[col]}
                            />
                          </div>
                        </div>
                      </Popover.Anchor>
                      <Popover.Portal>
                        <Popover.Content
                          align="start"
                          side="bottom"
                          sideOffset={4}
                          className="z-50 outline-none"
                          onOpenAutoFocus={(e) => e.preventDefault()}
                        >
                          {isEditingThisCell && editingCell !== null && (
                            <CellEditor
                              field={col}
                              value={editingCell.value}
                              reference={referenceFields?.[col]}
                              onCancel={() => setEditingCell(null)}
                              onSave={(value) => {
                                onCellEdit?.(rowId, col, value);
                                setEditingCell(null);
                              }}
                            />
                          )}
                        </Popover.Content>
                      </Popover.Portal>
                    </Popover.Root>
                  );
                })}
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
  value,
  reference
}: {
  field: string;
  value: unknown;
  reference?: ReferenceFieldOptions | undefined;
}) {
  if (reference) {
    const display = getReferenceDisplay(reference, value);
    if (!display) {
      return (
        <span className="text-text-tertiary italic">
          {reference.field.optional ? "none" : "-"}
        </span>
      );
    }
    return (
      <span
        className={cn(
          "inline-flex max-w-full items-center gap-1.5 rounded border px-1.5 py-0.5 text-[11px]",
          display.missing
            ? "border-error/30 bg-error/5 text-error"
            : "border-accent/20 bg-accent/5 text-text-secondary"
        )}
        title={`${field} -> ${reference.tableName}\n${display.id}`}
      >
        <span className="truncate font-mono">{display.id}</span>
        <span className="shrink-0 text-text-tertiary">
          {display.missing ? "missing" : reference.tableName}
        </span>
      </span>
    );
  }

  const preview = formatCellPreview(field, value);

  if (preview.kind === "date") {
    const readable = formatReadableDate(preview.text);
    return (
      <span
        className="block truncate tabular-nums text-[11px] text-amber-100"
        title={preview.title ? `${preview.text}\n${preview.title}` : preview.text}
      >
        {readable}
      </span>
    );
  }

  if (preview.kind === "color" && preview.colorHex) {
    return (
      <span className="inline-flex items-center gap-1.5" title={preview.text}>
        <span
          className="inline-block size-3.5 shrink-0 rounded-sm border border-white/20"
          style={{ backgroundColor: preview.colorHex }}
        />
        <span className="text-text-secondary">{preview.text}</span>
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

function RowCheckbox({
  checked,
  onChange,
  ariaLabel
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <label className="flex cursor-pointer items-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
        aria-label={ariaLabel}
        className="sr-only"
      />
      <div
        aria-hidden
        className={cn(
          "flex size-3.5 items-center justify-center rounded-sm border transition-colors",
          checked
            ? "border-accent bg-accent"
            : "border-border bg-bg-base hover:border-border-hover"
        )}
      >
        {checked && (
          <svg
            viewBox="0 0 10 8"
            className="size-2.5"
            fill="none"
            stroke="white"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M1 4L3.5 6.5L9 1" />
          </svg>
        )}
      </div>
    </label>
  );
}

function getColumnWidthClass(column: string): string {
  if (column === "_id" || column === "id") {
    return "w-[18rem]";
  }
  if (isDateLikeField(column) || column === "_creationTime") {
    return "w-[16rem]";
  }
  if (isColorLikeField(column)) {
    return "w-40";
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
