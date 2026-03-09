import { cn } from "@/lib/utils";
import { Copy, Check } from "lucide-react";
import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";

interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
  showCopy?: boolean;
  maxHeight?: string;
}

export function CodeBlock({
  code,
  language,
  className,
  showCopy = true,
  maxHeight = "300px"
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [code]);

  return (
    <div
      className={cn(
        "relative group rounded-md border border-border bg-bg-base overflow-hidden",
        className
      )}
    >
      {/* Header with language badge */}
      {language && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-bg-surface/50">
          <span className="text-[10px] uppercase tracking-wider text-text-tertiary font-medium">
            {language}
          </span>
        </div>
      )}

      {/* Copy button */}
      {showCopy && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleCopy}
          className={cn(
            "absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity",
            language && "top-9",
            copied && "opacity-100 text-success"
          )}
          title="Copy to clipboard"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </Button>
      )}

      {/* Code content */}
      <div className="overflow-auto" style={{ maxHeight }}>
        <pre className="p-3 text-[12px] leading-relaxed">
          <code className="font-mono text-text-code whitespace-pre">
            {code}
          </code>
        </pre>
      </div>
    </div>
  );
}
