import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface DataTableProps {
  columns: string[];
  rows: Record<string, unknown>[];
  selectedRowId?: string | null;
  onRowClick?: (row: Record<string, unknown>) => void;
  onCellEdit?: (rowId: string, field: string, value: unknown) => void;
  className?: string;
}

export function DataTable({
  columns,
  rows,
  selectedRowId,
  onRowClick,
  className
}: DataTableProps) {
  return (
    <ScrollArea className={cn("w-full", className)}>
      <div className="min-w-full">
        {/* Header */}
        <div className="flex border-b border-border bg-bg-surface/50 sticky top-0 z-10">
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

            return (
              <div
                key={rowId}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  "flex border-b border-border transition-colors cursor-pointer",
                  isSelected
                    ? "bg-accent/8 border-l-2 border-l-accent"
                    : "hover:bg-bg-elevated/50"
                )}
              >
                {columns.map((col) => (
                  <div
                    key={col}
                    className="flex-shrink-0 w-48 px-3 py-2 text-[12px] text-text-secondary font-mono truncate border-r border-border last:border-r-0"
                  >
                    <CellValue value={row[col]} />
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
