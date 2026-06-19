import type { ReactNode } from "react";
import { ArrowUpRight, Info } from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger
} from "@/components/ui/hover-card";
import { getTerm } from "@/lib/glossary/terms";
import { useDocsModal } from "@/lib/docsModal";
import { cn } from "@/lib/utils";

interface InfoTooltipProps {
  /** Slug of the glossary term (see `lib/glossary/terms.ts`). */
  termSlug: string;
  /**
   * The element to wrap. When provided, the hover card opens over this element
   * (the child must forward refs/spread props — use a plain element).
   */
  children?: ReactNode;
  /** Side the card opens on. Defaults to `top`. */
  side?: "top" | "bottom" | "left" | "right";
  /**
   * When `true` (and no `children`), render a small info icon as the trigger.
   * Useful next to a heading or label.
   */
  showIcon?: boolean;
  className?: string;
}

/**
 * Compact explanatory hover card for opaque dashboard terms.
 *
 * Opens on hover and shows the term's short definition plus a "Learn more"
 * button that opens the in-app documentation modal (no router navigation).
 * Uses Radix HoverCard so the content is interactive — the cursor can move
 * into the card and the button is clickable.
 *
 * If the term slug is unknown (typo / missing registration), the component
 * renders its children unchanged without a hover card — the UI never breaks on
 * a missing glossary entry.
 */
export function InfoTooltip({
  termSlug,
  children,
  side = "top",
  showIcon = false,
  className
}: InfoTooltipProps) {
  const term = getTerm(termSlug);
  const openDocs = useDocsModal((s) => s.openDocs);

  // Fail gracefully: a missing term should never break the surrounding UI.
  if (!term) {
    if (children) return <>{children}</>;
    return null;
  }

  const trigger = children ?? (showIcon ? (
    <Info
      size={13}
      className="text-text-tertiary hover:text-text-secondary transition-colors cursor-help"
      aria-label={`About ${term.title}`}
    />
  ) : null);

  if (!trigger) return null;

  // Hide a redundant title line when it just repeats the wrapped text. We only
  // know the wrapped text at runtime for string children; otherwise always show
  // the title so the card is self-describing.
  const childText =
    typeof children === "string"
      ? children
      : (children as { props?: { children?: unknown } } | null)?.props?.children;
  const showTitle =
    typeof childText !== "string" || childText.trim() !== term.title;

  return (
    <HoverCard>
      <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
      <HoverCardContent
        side={side}
        className={cn("w-60 p-2.5 text-left", className)}
      >
        {showTitle && (
          <div className="mb-0.5 text-[11px] font-semibold text-text-primary">
            {term.title}
          </div>
        )}
        <div className="text-[11px] leading-snug text-text-secondary">
          {term.short}
        </div>
        <div className="mt-1.5">
          <button
            type="button"
            onClick={() => openDocs(term.docSlug)}
            className="inline-flex items-center gap-0.5 text-[10px] font-medium text-accent transition-colors hover:text-accent-muted"
          >
            Saiba mais
            <ArrowUpRight size={11} />
          </button>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
