import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { TableIndex } from "@syncore/devtools-protocol";
import { Key, ArrowUpDown } from "lucide-react";

interface IndexesViewerProps {
  indexes: TableIndex[];
  className?: string;
}

export function IndexesViewer({ indexes, className }: IndexesViewerProps) {
  if (indexes.length === 0) {
    return (
      <div className={cn("py-8 text-center", className)}>
        <p className="text-[12px] text-text-tertiary">
          No indexes defined for this table
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className={cn("h-full", className)}>
      <div className="space-y-2 p-4">
        {indexes.map((index) => (
          <div
            key={index.name}
            className="rounded-md border border-border bg-bg-surface p-3"
          >
            <div className="mb-2 flex items-center gap-2">
              <Key size={12} className="text-accent shrink-0" />
              <span className="text-[12px] text-text-primary font-mono font-medium">
                {index.name}
              </span>
              {index.unique && (
                <Badge variant="warning" className="text-[10px]">
                  unique
                </Badge>
              )}
            </div>
            <div className="ml-5 flex items-center gap-1.5">
              <ArrowUpDown size={10} className="text-text-tertiary" />
              <div className="flex items-center gap-1">
                {index.fields.map((field, i) => (
                  <span key={field}>
                    <code className="rounded bg-bg-base px-1 py-0.5 text-[11px] text-text-code">
                      {field}
                    </code>
                    {i < index.fields.length - 1 && (
                      <span className="text-text-tertiary text-[10px] mx-0.5">
                        ,
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
