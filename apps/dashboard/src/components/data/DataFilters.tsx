import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Plus, X, Filter } from "lucide-react";
import type { DataFilter } from "@syncore/devtools-protocol";

const OPERATORS: Array<{ value: DataFilter["operator"]; label: string }> = [
  { value: "eq", label: "=" },
  { value: "neq", label: "!=" },
  { value: "gt", label: ">" },
  { value: "gte", label: ">=" },
  { value: "lt", label: "<" },
  { value: "lte", label: "<=" },
  { value: "contains", label: "contains" },
  { value: "startsWith", label: "starts with" }
];

interface DataFiltersProps {
  fields: string[];
  filters: DataFilter[];
  onFiltersChange: (filters: DataFilter[]) => void;
  className?: string;
}

export function DataFilters({
  fields,
  filters,
  onFiltersChange,
  className
}: DataFiltersProps) {
  const [isOpen, setIsOpen] = useState(filters.length > 0);

  const addFilter = () => {
    if (fields.length === 0) return;
    onFiltersChange([
      ...filters,
      { field: fields[0]!, operator: "eq", value: "" }
    ]);
    setIsOpen(true);
  };

  const removeFilter = (index: number) => {
    onFiltersChange(filters.filter((_, i) => i !== index));
  };

  const updateFilter = (index: number, updates: Partial<DataFilter>) => {
    onFiltersChange(
      filters.map((f, i) => (i === index ? { ...f, ...updates } : f))
    );
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="xs"
          onClick={() => setIsOpen(!isOpen)}
          className="gap-1"
        >
          <Filter size={11} />
          Filters
          {filters.length > 0 && (
            <Badge variant="secondary" className="ml-1 text-[9px] px-1 py-0">
              {filters.length}
            </Badge>
          )}
        </Button>
        <Button variant="ghost" size="xs" onClick={addFilter} className="gap-1">
          <Plus size={11} />
          Add Filter
        </Button>
      </div>

      {isOpen && filters.length > 0 && (
        <div className="space-y-1.5 p-2 rounded-md border border-border bg-bg-surface/50">
          {filters.map((filter, i) => (
            <div key={i} className="flex items-center gap-2">
              <Select
                value={filter.field}
                onValueChange={(v) => updateFilter(i, { field: v })}
              >
                <SelectTrigger className="h-7 w-36 text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fields.map((f) => (
                    <SelectItem key={f} value={f} className="text-[11px]">
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filter.operator}
                onValueChange={(v) =>
                  updateFilter(i, {
                    operator: v as DataFilter["operator"]
                  })
                }
              >
                <SelectTrigger className="h-7 w-28 text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPERATORS.map((op) => (
                    <SelectItem
                      key={op.value}
                      value={op.value}
                      className="text-[11px]"
                    >
                      {op.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                value={String(filter.value)}
                onChange={(e) => updateFilter(i, { value: e.target.value })}
                placeholder="Value..."
                className="h-7 flex-1 text-[11px]"
              />

              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => removeFilter(i)}
              >
                <X size={11} />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
