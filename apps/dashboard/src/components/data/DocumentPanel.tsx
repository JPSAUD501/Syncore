import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { JsonViewer } from "@/components/shared";
import { X, Copy, Check, Trash2, Edit, CopyPlus } from "lucide-react";
import { useState, useCallback } from "react";
import { formatCellPreview } from "@/lib/dataValue";

interface DocumentPanelProps {
  document: Record<string, unknown> | null;
  onClose: () => void;
  onDelete?: (id: string) => void;
  onEditField?: (id: string, field: string, value: unknown) => void;
  onEditDocument?: (document: Record<string, unknown>) => void;
  onDuplicate?: (document: Record<string, unknown>) => void;
  className?: string;
}

export function DocumentPanel({
  document,
  onClose,
  onDelete,
  onEditField,
  onEditDocument,
  onDuplicate,
  className
}: DocumentPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!document) return;
    void navigator.clipboard
      .writeText(JSON.stringify(document, null, 2))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
  }, [document]);

  if (!document) return null;

  const docId = getDocumentId(document);

  return (
    <div
      className={cn(
        "flex w-[24rem] flex-col border-l border-border bg-bg-base",
        className
      )}
    >
      <div className="border-b border-border px-4 py-3">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-text-primary">
              Inspector
            </div>
            <div className="mt-1 flex min-w-0 items-center gap-2">
              <Badge variant="outline" className="shrink-0 text-[9px]">
                Document
              </Badge>
              <span className="truncate font-mono text-[11px] text-text-secondary">
                {docId}
              </span>
            </div>
          </div>
          <Button variant="ghost" size="icon-xs" onClick={onClose}>
            <X size={11} />
          </Button>
        </div>
        <div className="flex items-center gap-1 shrink-0 rounded-md border border-border bg-bg-surface p-1">
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
          {onDuplicate && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onDuplicate(document)}
              title="Duplicate document"
            >
              <CopyPlus size={11} />
            </Button>
          )}
          {onEditDocument && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onEditDocument(document)}
              title="Edit document JSON"
            >
              <Edit size={11} />
            </Button>
          )}
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
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4">
          <JsonViewer
            data={document}
            defaultExpanded
            maxDepth={6}
            showCopy={false}
          />
        </div>

        <Separator />

        {/* Field list */}
        <div className="p-4">
          <h4 className="mb-2 text-[11px] font-medium text-text-secondary">
            Fields
          </h4>
          <div className="space-y-1.5">
            {Object.entries(document).map(([key, value]) => (
              <div
                key={key}
                className="group flex items-start justify-between gap-3 rounded-md border border-transparent px-3 py-2 transition-colors hover:border-border hover:bg-bg-surface"
              >
                <div className="min-w-0">
                  <span className="font-mono text-[11px] text-accent">
                    {key}
                  </span>
                  <div className="mt-1 truncate text-[10px] text-text-secondary">
                    {formatCellPreview(key, value).text}
                  </div>
                </div>
                <div className="ml-3 flex items-center gap-2">
                  <span className="text-[10px] text-text-tertiary">
                    {inferType(value)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => onEditField?.(docId, key, value)}
                    disabled={!onEditField}
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
