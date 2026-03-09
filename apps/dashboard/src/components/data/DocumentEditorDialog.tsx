import { useEffect, useMemo, useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface DocumentEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  initialDocument?: Record<string, unknown> | undefined;
  hint?: string | undefined;
  requireDirty?: boolean | undefined;
  onSubmit: (document: Record<string, unknown>) => Promise<void>;
}

export function DocumentEditorDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  initialDocument,
  hint,
  requireDirty = false,
  onSubmit
}: DocumentEditorDialogProps) {
  const initialValue = useMemo(
    () => stripSystemFields(initialDocument ?? {}),
    [initialDocument]
  );
  const initialText = useMemo(
    () => JSON.stringify(initialValue, null, 2) ?? "{}",
    [initialValue]
  );
  const [text, setText] = useState(initialText);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setText(initialText);
      setSubmitError(null);
      setSubmitting(false);
    }
  }, [initialText, open]);

  const parsedState = useMemo(() => {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!isPlainObject(parsed)) {
        return {
          value: null,
          parseError: "The document must be a JSON object."
        };
      }

      return {
        value: stripSystemFields(parsed),
        parseError: null
      };
    } catch (err) {
      return {
        value: null,
        parseError: err instanceof Error ? err.message : "Invalid JSON"
      };
    }
  }, [text]);

  const isDirty = useMemo(() => {
    if (!parsedState.value) return false;
    return JSON.stringify(parsedState.value) !== JSON.stringify(initialValue);
  }, [initialValue, parsedState.value]);

  const diff = useMemo(() => {
    if (!parsedState.value) return null;
    return summarizeDiff(initialValue, parsedState.value);
  }, [initialValue, parsedState.value]);

  const handleSubmit = async () => {
    setSubmitError(null);

    if (parsedState.parseError || !parsedState.value) {
      return;
    }

    if (requireDirty && !isDirty) {
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(parsedState.value);
      onOpenChange(false);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to save document."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={isDirty ? "warning" : "secondary"}
              className="text-[10px]"
            >
              {isDirty ? "Unsaved changes" : "No changes"}
            </Badge>
            {diff && (
              <span className="text-[11px] text-text-tertiary">
                +{diff.added} added, ~{diff.changed} changed, -{diff.removed}{" "}
                removed
              </span>
            )}
          </div>

          <div className="rounded-md border border-border bg-bg-base/70 p-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              className="min-h-[320px] w-full resize-y bg-transparent px-2 py-1 font-mono text-[12px] leading-6 text-text-code outline-none placeholder:text-text-tertiary"
              placeholder='{
  "name": "Ada",
  "role": "admin"
}'
            />
          </div>

          {hint && (
            <div className="flex items-start gap-2 rounded-md border border-accent/15 bg-accent/5 px-3 py-2 text-[11px] text-text-secondary">
              <Wand2 size={12} className="mt-0.5 shrink-0 text-accent" />
              <p>{hint}</p>
            </div>
          )}

          {parsedState.parseError && (
            <div className="rounded-md border border-error/20 bg-error/5 px-3 py-2 text-[11px] text-error">
              {parsedState.parseError}
            </div>
          )}

          {submitError && (
            <div className="rounded-md border border-error/20 bg-error/5 px-3 py-2 text-[11px] text-error">
              {submitError}
            </div>
          )}
        </div>

        <DialogFooter showCloseButton>
          <Button
            variant="ghost"
            onClick={() => setText(initialText)}
            disabled={submitting || text === initialText}
          >
            Reset
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={
              submitting ||
              !!parsedState.parseError ||
              (requireDirty && !isDirty)
            }
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function stripSystemFields(document: Record<string, unknown>) {
  const next = { ...document };
  delete next._id;
  delete next._creationTime;
  return next;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function summarizeDiff(
  previous: Record<string, unknown>,
  next: Record<string, unknown>
) {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  let added = 0;
  let changed = 0;
  let removed = 0;

  for (const key of keys) {
    const hadKey = key in previous;
    const hasKey = key in next;

    if (!hadKey && hasKey) {
      added += 1;
      continue;
    }

    if (hadKey && !hasKey) {
      removed += 1;
      continue;
    }

    if (JSON.stringify(previous[key]) !== JSON.stringify(next[key])) {
      changed += 1;
    }
  }

  return { added, changed, removed };
}
