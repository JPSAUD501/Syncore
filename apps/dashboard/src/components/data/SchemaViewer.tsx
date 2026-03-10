import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { TableSchema } from "@syncore/devtools-protocol";
import { Layers, Hash, ToggleLeft, Type, Calendar, Braces } from "lucide-react";

interface SchemaViewerProps {
  schema: TableSchema | null;
  className?: string;
}

const TYPE_ICONS: Record<
  string,
  React.ComponentType<{ size?: number; className?: string }>
> = {
  string: Type,
  number: Hash,
  boolean: ToggleLeft,
  object: Braces,
  array: Layers,
  date: Calendar
};

export function SchemaViewer({ schema, className }: SchemaViewerProps) {
  if (!schema) {
    return (
      <div className={cn("py-8 text-center", className)}>
        <p className="text-[12px] text-text-tertiary">
          Select a table to view its schema
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className={cn("h-full", className)}>
      <div className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-[13px] font-semibold text-text-primary">
            {schema.name}
          </h3>
          <Badge variant="outline" className="text-[10px]">
            {schema.fields.length} fields
          </Badge>
          <Badge variant="secondary" className="text-[10px]">
            {schema.documentCount} docs
          </Badge>
        </div>

        <div className="space-y-1">
          {schema.fields.map((field) => {
            const Icon = TYPE_ICONS[field.type] ?? Type;
            return (
              <div
                key={field.name}
                className="flex items-center gap-3 rounded-md border border-transparent px-3 py-2 transition-colors hover:border-border hover:bg-bg-surface"
              >
                <Icon size={12} className="text-text-tertiary shrink-0" />
                <span className="text-[12px] text-text-primary font-mono flex-1">
                  {field.name}
                </span>
                <Badge variant="outline" className="text-[10px] font-mono">
                  {field.type}
                </Badge>
                {field.optional && (
                  <Badge variant="secondary" className="text-[10px]">
                    optional
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
}
