import { useState, useCallback, useRef } from "react";
import { Calendar, Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ReferenceFieldOptions, ReferenceOption } from "@/lib/dataReferences";
import { parseEditableCellValue, toEditableCellText, inferColorValue, inferDateValue } from "@/lib/dataValue";
import { cn } from "@/lib/utils";

interface CellEditorProps {
  value: unknown;
  field: string;
  reference?: ReferenceFieldOptions | undefined;
  onSave: (value: unknown) => void;
  onCancel: () => void;
}

export function CellEditor({ value, field, reference, onSave, onCancel }: CellEditorProps) {
  const [text, setText] = useState(() => toEditableCellText(field, value));
  const [referenceValue, setReferenceValue] = useState(() =>
    typeof value === "string" ? value : ""
  );
  const colorInfo = inferColorValue(field, value);
  const dateInfo = inferDateValue(field, value);
  const isNumericToggleable = typeof value === "number" && !colorInfo && !reference;

  const [asDatetime, setAsDatetime] = useState(() => !!dateInfo);

  const isMultiline =
    !colorInfo &&
    !asDatetime &&
    (typeof value === "object" || text.includes("\n") || text.length > 80);

  const handleToggleDatetime = useCallback(() => {
    if (!asDatetime) {
      const num = parseFloat(text);
      if (!isNaN(num)) {
        const ms = num >= 1_000_000_000_000 ? num : num * 1000;
        setText(new Date(ms).toISOString());
      }
    } else {
      const d = new Date(text);
      if (!isNaN(d.getTime())) {
        const ms = d.getTime();
        const result =
          typeof value === "number" && value < 1_000_000_000_000
            ? Math.floor(ms / 1000)
            : ms;
        setText(String(result));
      }
    }
    setAsDatetime((prev) => !prev);
  }, [asDatetime, text, value]);

  const handleSave = useCallback(() => {
    if (reference) {
      onSave(referenceValue === "" && reference.field.optional ? undefined : referenceValue);
      return;
    }
    // User manually toggled to datetime for a plain number field
    if (asDatetime && isNumericToggleable && !dateInfo) {
      const d = new Date(text);
      if (!isNaN(d.getTime())) {
        const ms = d.getTime();
        const result =
          typeof value === "number" && value < 1_000_000_000_000
            ? Math.floor(ms / 1000)
            : ms;
        onSave(result);
        return;
      }
    }
    // Auto-detected date field but user toggled back to raw number
    if (!asDatetime && dateInfo) {
      const num = Number(text);
      if (!isNaN(num)) {
        onSave(num);
        return;
      }
    }
    onSave(parseEditableCellValue(field, text, value));
  }, [asDatetime, isNumericToggleable, dateInfo, field, onSave, reference, referenceValue, text, value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      if (e.key === "Enter" && !e.shiftKey && !isMultiline) {
        e.preventDefault();
        handleSave();
      }
    },
    [handleSave, isMultiline, onCancel]
  );

  const typeLabel = colorInfo
    ? "color"
    : reference
      ? `id -> ${reference.tableName}`
      : asDatetime
        ? "datetime"
        : isMultiline
          ? "json"
          : typeof value;

  return (
    <div className={cn("overflow-hidden rounded-lg border border-border bg-bg-surface shadow-xl shadow-black/40", reference ? "w-120" : "w-72")}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="font-mono text-[11px] font-medium text-text-primary">{field}</span>
        <div className="flex items-center gap-1.5">
          {isNumericToggleable && (
            <button
              type="button"
              title={asDatetime ? "Edit as number" : "Edit as datetime"}
              onClick={handleToggleDatetime}
              className={cn(
                "rounded p-0.5 transition-colors",
                asDatetime
                  ? "text-accent hover:text-accent/80"
                  : "text-text-tertiary hover:text-text-secondary"
              )}
            >
              <Calendar size={11} />
            </button>
          )}
          <span className="rounded bg-bg-base px-1.5 py-0.5 text-[10px] text-text-tertiary">
            {typeLabel}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className={reference ? "" : "p-3"}>
        {reference ? (
          <ReferenceEditor
            reference={reference}
            value={referenceValue}
            onChange={setReferenceValue}
            onKeyDown={handleKeyDown}
          />
        ) : colorInfo ? (
          <ColorEditor text={text} onTextChange={setText} onKeyDown={handleKeyDown} />
        ) : asDatetime ? (
          <DateEditor text={text} onTextChange={setText} />
        ) : isMultiline ? (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            rows={Math.min(Math.max(text.split("\n").length, 3), 8)}
            className="w-full resize-y rounded-md border border-border bg-bg-base px-2.5 py-2 font-mono text-[11px] leading-relaxed text-text-primary outline-none focus:border-accent placeholder:text-text-tertiary"
            placeholder={`Edit ${field}…`}
          />
        ) : (
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            className="font-mono text-[12px]"
            placeholder={`Edit ${field}…`}
          />
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-1.5 border-t border-border px-3 py-2">
        <Button variant="ghost" size="xs" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="xs" onClick={handleSave}>
          Save
        </Button>
      </div>
    </div>
  );
}

function ReferenceEditor({
  reference,
  value,
  onChange,
  onKeyDown
}: {
  reference: ReferenceFieldOptions;
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  const [query, setQuery] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const selectedOption = reference.options.find((o) => o.id === value);
  const hasCurrentValue = value !== "" && !selectedOption;
  const filteredOptions = normalizedQuery
    ? reference.options.filter((o) => o.searchText.includes(normalizedQuery))
    : reference.options;
  const visibleOptions = filteredOptions.slice(0, 100);

  // Right-panel shows: hovered → selected → first in list
  const detailOption =
    reference.options.find((o) => o.id === hoveredId) ??
    selectedOption ??
    filteredOptions[0] ??
    null;

  return (
    <div className="flex h-60 divide-x divide-border">
      {/* Left: search + options */}
      <div className="flex w-50 shrink-0 flex-col">
        {hasCurrentValue && (
          <div className="shrink-0 border-b border-error/20 bg-error/5 px-3 py-2">
            <p className="text-[11px] text-error">
              <span className="font-medium">Missing:</span>{" "}
              <span className="font-mono text-[10px]">
                {value.slice(0, 14)}{value.length > 14 ? "…" : ""}
              </span>
            </p>
          </div>
        )}
        <div className="relative shrink-0 border-b border-border">
          <Search
            size={11}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="w-full bg-transparent py-2 pl-7 pr-3 text-[11px] text-text-primary outline-none placeholder:text-text-tertiary"
            onKeyDown={onKeyDown}
            autoFocus
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {reference.field.optional && (
            <button
              type="button"
              onMouseEnter={() => setHoveredId(null)}
              onClick={() => onChange("")}
              className={cn(
                "flex w-full items-center border-b border-border px-3 py-2 text-left transition-colors hover:bg-bg-surface last:border-b-0",
                value === ""
                  ? "border-l-2 border-l-accent bg-accent/5"
                  : "border-l-2 border-l-transparent"
              )}
            >
              <span className="flex-1 text-[12px] italic text-text-tertiary">None</span>
              {value === "" && <Check size={11} className="shrink-0 text-accent" />}
            </button>
          )}
          {filteredOptions.length > 0 ? (
            visibleOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onMouseEnter={() => setHoveredId(option.id)}
                onClick={() => onChange(option.id)}
                className={cn(
                  "flex w-full items-center border-b border-border px-3 py-2 text-left transition-colors hover:bg-bg-surface last:border-b-0",
                  option.id === value
                    ? "border-l-2 border-l-accent bg-accent/5"
                    : "border-l-2 border-l-transparent"
                )}
              >
                <span className="min-w-0 flex-1 truncate text-[12px] text-text-primary">
                  {option.preview}
                </span>
                {option.id === value && (
                  <Check size={11} className="ml-2 shrink-0 text-accent" />
                )}
              </button>
            ))
          ) : (
            <div className="px-3 py-6 text-center text-[11px] text-text-tertiary">
              No matches
            </div>
          )}
          {filteredOptions.length > visibleOptions.length && (
            <div className="border-t border-border px-3 py-2 text-[10px] text-text-tertiary">
              Showing first {visibleOptions.length} of {filteredOptions.length}. Refine search to narrow results.
            </div>
          )}
        </div>
      </div>

      {/* Right: document detail */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {detailOption != null ? (
          <ReferenceDocumentDetail option={detailOption} />
        ) : (
          <div className="flex h-full items-center justify-center p-4 text-[11px] italic text-text-tertiary">
            No rows in {reference.tableName}
          </div>
        )}
      </div>
    </div>
  );
}

function ReferenceDocumentDetail({ option }: { option: ReferenceOption }) {
  const entries = Object.entries(option.document).filter(
    ([k]) => k !== "_id" && k !== "_creationTime"
  );
  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border bg-bg-base/40 px-3 py-2">
        <span className="font-mono text-[10px] text-text-tertiary">{option.id}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2.5">
        {entries.length === 0 ? (
          <p className="py-4 text-center text-[11px] italic text-text-tertiary">
            No additional fields
          </p>
        ) : (
          <dl className="space-y-2.5">
            {entries.map(([key, val]) => (
              <div key={key}>
                <dt className="mb-0.5 text-[9px] font-semibold uppercase tracking-wide text-text-tertiary">
                  {key}
                </dt>
                <dd className="text-[11px]">
                  <ReferenceFieldValue value={val} />
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}

function ReferenceFieldValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="italic text-text-tertiary">null</span>;
  }
  if (typeof value === "boolean") {
    return <span className="text-amber-400">{String(value)}</span>;
  }
  if (typeof value === "number") {
    return <span className="text-info">{String(value)}</span>;
  }
  if (typeof value === "string") {
    return value.length > 0 ? (
      <span className="break-all text-text-primary">{value}</span>
    ) : (
      <span className="italic text-text-tertiary">{`""`}</span>
    );
  }
  if (Array.isArray(value)) {
    return (
      <span className="text-text-tertiary">
        [{value.length} item{value.length === 1 ? "" : "s"}]
      </span>
    );
  }
  return (
    <span className="break-all font-mono text-[10px] text-text-secondary">
      {JSON.stringify(value)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Color sub-editor                                                    */
/* ------------------------------------------------------------------ */

function ColorEditor({
  text,
  onTextChange,
  onKeyDown
}: {
  text: string;
  onTextChange: (t: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  const colorInputRef = useRef<HTMLInputElement>(null);
  const displayHex = /^#[0-9a-fA-F]{3,8}$/.test(text) ? text : "#000000";

  return (
    <div className="space-y-2.5">
      {/* Large clickable swatch that opens the native colour picker */}
      <button
        type="button"
        onClick={() => colorInputRef.current?.click()}
        className="relative h-14 w-full rounded-md border border-border transition-opacity hover:opacity-90 active:scale-[0.99]"
        style={{ backgroundColor: displayHex }}
        title="Click to open colour picker"
      >
        <input
          ref={colorInputRef}
          type="color"
          value={displayHex}
          onChange={(e) => onTextChange(e.target.value)}
          className="absolute size-0 opacity-0"
          tabIndex={-1}
        />
      </button>

      {/* Hex text input */}
      <Input
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        onKeyDown={onKeyDown}
        autoFocus
        className="font-mono text-[12px]"
        placeholder="#000000"
        maxLength={9}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Datetime sub-editor                                                 */
/* ------------------------------------------------------------------ */

function DateEditor({
  text,
  onTextChange
}: {
  text: string;
  onTextChange: (t: string) => void;
}) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const initial = text ? new Date(text) : new Date();
  const valid = !isNaN(initial.getTime());

  const [localDate, setLocalDate] = useState(() =>
    valid
      ? `${initial.getFullYear()}-${pad(initial.getMonth() + 1)}-${pad(initial.getDate())}`
      : ""
  );
  const [localTime, setLocalTime] = useState(() =>
    valid
      ? `${pad(initial.getHours())}:${pad(initial.getMinutes())}:${pad(initial.getSeconds())}`
      : ""
  );

  const commit = (date: string, time: string) => {
    try {
      const d = new Date(`${date}T${time || "00:00:00"}`);
      if (!isNaN(d.getTime())) onTextChange(d.toISOString());
    } catch { /* ignore malformed */ }
  };

  const preview = (() => {
    try {
      const d = new Date(`${localDate}T${localTime || "00:00:00"}`);
      if (isNaN(d.getTime())) return null;
      return d.toLocaleString(undefined, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    } catch { return null; }
  })();

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="date"
          value={localDate}
          onChange={(e) => {
            setLocalDate(e.target.value);
            commit(e.target.value, localTime);
          }}
          autoFocus
          className="h-8 flex-1 rounded-md border border-border bg-bg-base px-2 text-[12px] text-text-primary outline-none scheme-dark focus:border-accent"
        />
        <input
          type="time"
          step="1"
          value={localTime}
          onChange={(e) => {
            setLocalTime(e.target.value);
            commit(localDate, e.target.value);
          }}
          className="h-8 w-28 shrink-0 rounded-md border border-border bg-bg-base px-2 text-[12px] text-text-primary outline-none scheme-dark focus:border-accent"
        />
      </div>
      {preview && (
        <p className="text-[10px] leading-none text-text-tertiary">{preview}</p>
      )}
    </div>
  );
}
