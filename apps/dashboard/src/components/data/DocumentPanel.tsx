import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { JsonViewer } from "@/components/shared";
import { X, Copy, Check, Trash2, Edit } from "lucide-react";
import { useState, useCallback } from "react";

interface DocumentPanelProps {
  document: Record<string, unknown> | null;
  onClose: () => void;
  onDelete?: (id: string) => void;
  onEdit?: (id: string, field: string, value: unknown) => void;
  className?: string;
}

export function DocumentPanel({
  document,
  onClose,
  onDelete,
  className
}: DocumentPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!document) return;
    navigator.clipboard
      .writeText(JSON.stringify(document, null, 2))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
  }, [document]);

  if (!document) return null;

  const docId = String(document._id ?? document.id ?? "unknown");

  return (
    <div
      className={cn(
        "w-96 border-l border-border flex flex-col bg-bg-base",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant="outline" className="text-[9px] shrink-0">
            Document
          </Badge>
          <span className="text-[11px] text-text-secondary font-mono truncate">
            {docId}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleCopy}
            title="Copy JSON"
          >
            {copied ? (
              <Check size={11} className="text-success" />
            ) : (
              <Copy size={11} />
            )}
          </Button>
          {onDelete && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onDelete(docId)}
              title="Delete document"
            >
              <Trash2 size={11} className="text-error" />
            </Button>
          )}
          <Button variant="ghost" size="icon-xs" onClick={onClose}>
            <X size={11} />
          </Button>
        </div>
      </div>

      {/* Document content */}
      <ScrollArea className="flex-1">
        <div className="p-3">
          <JsonViewer
            data={document}
            defaultExpanded
            maxDepth={6}
            showCopy={false}
          />
        </div>

        <Separator />

        {/* Field list */}
        <div className="p-3">
          <h4 className="text-[10px] uppercase tracking-wider font-semibold text-text-tertiary mb-2">
            Fields
          </h4>
          <div className="space-y-1">
            {Object.entries(document).map(([key, value]) => (
              <div
                key={key}
                className="flex items-center justify-between py-1 px-2 rounded hover:bg-bg-surface/50 transition-colors group"
              >
                <span className="text-[11px] text-accent font-mono">{key}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-text-tertiary">
                    {inferType(value)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Edit field"
                  >
                    <Edit size={9} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function inferType(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `array(${value.length})`;
  return typeof value;
}
