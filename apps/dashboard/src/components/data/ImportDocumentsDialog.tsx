import { useEffect, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { parseDocumentImportText } from "@/lib/documents";

interface ImportDocumentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableName: string | null;
  initialText?: string | undefined;
  onImport: (documents: Record<string, unknown>[]) => Promise<void>;
}

export function ImportDocumentsDialog({
  open,
  onOpenChange,
  tableName,
  initialText,
  onImport
}: ImportDocumentsDialogProps) {
  const [text, setText] = useState(initialText ?? "[]");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setText(initialText ?? "[]");
      setError(null);
      setSubmitting(false);
    }
  }, [initialText, open]);

  const handleImport = async () => {
    setError(null);

    let documents: Record<string, unknown>[];
    try {
      documents = parseDocumentImportText(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid import payload.");
      return;
    }

    setSubmitting(true);
    try {
      await onImport(documents);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Documents</DialogTitle>
          <DialogDescription>
            Paste a JSON object, a JSON array, or JSONL to import into{" "}
            <span className="font-mono text-text-primary">
              {tableName ?? "the selected table"}
            </span>
            .
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border border-border bg-bg-base/70 p-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              className="min-h-[320px] w-full resize-y bg-transparent px-2 py-1 font-mono text-[12px] leading-6 text-text-code outline-none placeholder:text-text-tertiary"
              placeholder='[
  { "name": "Ada" },
  { "name": "Grace" }
]'
            />
          </div>

          <div className="rounded-md border border-accent/15 bg-accent/5 px-3 py-2 text-[11px] text-text-secondary">
            System fields like{" "}
            <span className="font-mono text-text-primary">_id</span> and{" "}
            <span className="font-mono text-text-primary">_creationTime</span>{" "}
            are ignored on import.
          </div>

          {error && (
            <div className="rounded-md border border-error/20 bg-error/5 px-3 py-2 text-[11px] text-error">
              {error}
            </div>
          )}
        </div>

        <DialogFooter showCloseButton>
          <Button onClick={() => void handleImport()} disabled={submitting}>
            {submitting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Upload size={14} />
            )}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
