import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, X } from "lucide-react";

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
  const [text, setText] = useState(() => {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value, null, 2);
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      typeof value === "bigint"
    ) {
      return String(value);
    }
    return "";
  });

  const handleSave = useCallback(() => {
    // Try to parse as JSON first, fallback to string
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      // If it looks like a number, convert it
      const num = Number(text);
      if (!isNaN(num) && text.trim() !== "") {
        parsed = num;
      } else if (text === "true") {
        parsed = true;
      } else if (text === "false") {
        parsed = false;
      } else if (text === "null") {
        parsed = null;
      } else {
        parsed = text;
      }
    }
    onSave(parsed);
  }, [text, onSave]);

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
    <div className={cn("flex items-center gap-1", className)}>
      <span className="text-[10px] text-text-tertiary font-mono mr-1">
        {field}:
      </span>
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        autoFocus
        className="h-6 text-[11px] font-mono flex-1"
      />
      <Button variant="ghost" size="icon-xs" onClick={handleSave} title="Save">
        <Check size={11} className="text-success" />
      </Button>
      <Button variant="ghost" size="icon-xs" onClick={onCancel} title="Cancel">
        <X size={11} className="text-text-tertiary" />
      </Button>
    </div>
  );
}
