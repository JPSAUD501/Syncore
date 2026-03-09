import { cn } from "@/lib/utils";
import { useState, useCallback, useMemo } from "react";
import { ChevronRight, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface JsonViewerProps {
  data: unknown;
  className?: string;
  defaultExpanded?: boolean;
  maxDepth?: number;
  showCopy?: boolean;
}

export function JsonViewer({
  data,
  className,
  defaultExpanded = true,
  maxDepth = 5,
  showCopy = true
}: JsonViewerProps) {
  const [copied, setCopied] = useState(false);

  const jsonString = useMemo(() => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }, [data]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(jsonString).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [jsonString]);

  return (
    <div
      className={cn(
        "relative group rounded-md border border-border bg-bg-base overflow-hidden",
        className
      )}
    >
      {showCopy && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleCopy}
          className={cn(
            "absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity",
            copied && "opacity-100 text-success"
          )}
          title="Copy JSON"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </Button>
      )}

      <div className="p-3 overflow-auto max-h-[400px] text-[12px] font-mono">
        <JsonNode
          data={data}
          depth={0}
          maxDepth={maxDepth}
          defaultExpanded={defaultExpanded}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Recursive JSON tree node                                           */
/* ------------------------------------------------------------------ */

function JsonNode({
  data,
  depth,
  maxDepth,
  defaultExpanded,
  keyName
}: {
  data: unknown;
  depth: number;
  maxDepth: number;
  defaultExpanded: boolean;
  keyName?: string;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded && depth < maxDepth);

  if (data === null) {
    return (
      <span className="inline-flex gap-1">
        {keyName !== undefined && <JsonKey name={keyName} />}
        <span className="text-text-tertiary italic">null</span>
      </span>
    );
  }

  if (data === undefined) {
    return (
      <span className="inline-flex gap-1">
        {keyName !== undefined && <JsonKey name={keyName} />}
        <span className="text-text-tertiary italic">undefined</span>
      </span>
    );
  }

  if (typeof data === "string") {
    return (
      <span className="inline-flex gap-1">
        {keyName !== undefined && <JsonKey name={keyName} />}
        <span className="text-success">"{data}"</span>
      </span>
    );
  }

  if (typeof data === "number") {
    return (
      <span className="inline-flex gap-1">
        {keyName !== undefined && <JsonKey name={keyName} />}
        <span className="text-info">{data}</span>
      </span>
    );
  }

  if (typeof data === "boolean") {
    return (
      <span className="inline-flex gap-1">
        {keyName !== undefined && <JsonKey name={keyName} />}
        <span className="text-fn-action">{String(data)}</span>
      </span>
    );
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return (
        <span className="inline-flex gap-1">
          {keyName !== undefined && <JsonKey name={keyName} />}
          <span className="text-text-tertiary">[]</span>
        </span>
      );
    }

    return (
      <div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-0.5 hover:text-text-primary transition-colors"
        >
          <ChevronRight
            size={12}
            className={cn(
              "text-text-tertiary transition-transform",
              expanded && "rotate-90"
            )}
          />
          {keyName !== undefined && <JsonKey name={keyName} />}
          <span className="text-text-tertiary">
            [{expanded ? "" : `${data.length} items`}
          </span>
        </button>
        {expanded && (
          <div className="ml-4 border-l border-border/50 pl-2">
            {data.map((item, i) => (
              <div key={i} className="py-0.5">
                <JsonNode
                  data={item}
                  depth={depth + 1}
                  maxDepth={maxDepth}
                  defaultExpanded={defaultExpanded}
                  keyName={String(i)}
                />
                {i < data.length - 1 && (
                  <span className="text-text-tertiary">,</span>
                )}
              </div>
            ))}
          </div>
        )}
        {expanded && <span className="text-text-tertiary">]</span>}
        {!expanded && <span className="text-text-tertiary">]</span>}
      </div>
    );
  }

  if (typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) {
      return (
        <span className="inline-flex gap-1">
          {keyName !== undefined && <JsonKey name={keyName} />}
          <span className="text-text-tertiary">{"{}"}</span>
        </span>
      );
    }

    return (
      <div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-0.5 hover:text-text-primary transition-colors"
        >
          <ChevronRight
            size={12}
            className={cn(
              "text-text-tertiary transition-transform",
              expanded && "rotate-90"
            )}
          />
          {keyName !== undefined && <JsonKey name={keyName} />}
          <span className="text-text-tertiary">
            {"{"}
            {expanded ? "" : `${entries.length} keys`}
          </span>
        </button>
        {expanded && (
          <div className="ml-4 border-l border-border/50 pl-2">
            {entries.map(([key, value], i) => (
              <div key={key} className="py-0.5">
                <JsonNode
                  data={value}
                  depth={depth + 1}
                  maxDepth={maxDepth}
                  defaultExpanded={defaultExpanded}
                  keyName={key}
                />
                {i < entries.length - 1 && (
                  <span className="text-text-tertiary">,</span>
                )}
              </div>
            ))}
          </div>
        )}
        {expanded && <span className="text-text-tertiary">{"}"}</span>}
        {!expanded && <span className="text-text-tertiary">{"}"}</span>}
      </div>
    );
  }

  return (
    <span className="inline-flex gap-1">
      {keyName !== undefined && <JsonKey name={keyName} />}
      <span className="text-text-secondary">{String(data)}</span>
    </span>
  );
}

function JsonKey({ name }: { name: string }) {
  return (
    <>
      <span className="text-accent">{name}</span>
      <span className="text-text-tertiary">: </span>
    </>
  );
}
