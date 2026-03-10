import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, X } from "lucide-react";
import { parseEditableCellValue, toEditableCellText } from "@/lib/dataValue";

interface CellEditorProps {
  value: unknown;
  field: string;
  onSave: (value: unknown) => void;
  onCancel: () => void;
  className?: string;
}

export function CellEditor({
  value,
  field,
  onSave,
  onCancel,
  className
}: CellEditorProps) {
  const [text, setText] = useState(() => toEditableCellText(field, value));
  const isMultiline =
    typeof value === "object" || text.includes("\n") || text.length > 48;

  const handleSave = useCallback(() => {
    onSave(parseEditableCellValue(field, text, value));
  }, [field, onSave, text, value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSave();
      }
      if (e.key === "Escape") {
        onCancel();
      }
    },
    [handleSave, onCancel]
  );

  return (
    <div
      className={cn(
        "flex min-w-0 items-start gap-2 rounded-lg border border-accent/20 bg-bg-base/95 p-1.5 shadow-lg shadow-black/20",
        className
      )}
    >
      {isMultiline ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          rows={Math.min(Math.max(text.split("\n").length, 3), 8)}
          className="min-h-20 flex-1 resize-y border-0 bg-transparent px-2 py-1.5 font-mono text-[11px] text-text-primary outline-none placeholder:text-text-tertiary"
          placeholder={`Edit ${field}`}
        />
      ) : (
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          className="h-8 flex-1 border-0 bg-transparent px-2 py-1 font-mono text-[11px] shadow-none"
          placeholder={`Edit ${field}`}
        />
      )}
      <div className="flex shrink-0 items-center gap-1 self-start">
        <Button variant="ghost" size="icon-xs" onClick={handleSave} title="Save">
        <Check size={11} className="text-success" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onCancel}
          title="Cancel"
        >
          <X size={11} className="text-text-tertiary" />
        </Button>
      </div>
    </div>
  );
}
