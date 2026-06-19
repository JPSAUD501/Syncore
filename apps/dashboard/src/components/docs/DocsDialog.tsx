import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, FileQuestion } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Markdown } from "@/components/docs/Markdown";
import { getDoc, listDocs } from "@/content/docs";
import {
  GLOSSARY_CATEGORIES,
  termsByCategory
} from "@/lib/glossary/terms";
import { useDocsModal } from "@/lib/docsModal";
import { cn } from "@/lib/utils";

/**
 * Global documentation modal. Shows either the index (when `slug` is null) or a
 * single document. Navigation between docs happens inside the modal via the
 * `useDocsModal` store — no router involved.
 */
export function DocsDialog() {
  const open = useDocsModal((s) => s.open);
  const slug = useDocsModal((s) => s.slug);
  const openDocs = useDocsModal((s) => s.openDocs);
  const closeDocs = useDocsModal((s) => s.closeDocs);

  // Reset scroll to top whenever the visible doc changes.
  useEffect(() => {
    if (!open) return;
    const el = document.querySelector("[data-docs-scroll]");
    if (el) el.scrollTop = 0;
  }, [open, slug]);

  const doc = slug ? getDoc(slug) : null;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? openDocs(slug) : closeDocs())}>
      <DialogContent
        showCloseButton
        className="flex h-[82vh] max-h-[82vh] w-[min(56rem,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        <DialogTitle className="sr-only">
          {doc ? doc.title : "Syncore documentation"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          In-app documentation for Syncore dashboard concepts.
        </DialogDescription>

        <ScrollArea
          data-docs-scroll
          className="flex-1 overflow-y-auto px-6 py-5 md:px-8"
        >
          <AnimatePresence mode="wait">
            {doc ? (
              <motion.div
                key={`doc-${doc.slug}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.18, ease: [0.22, 0.61, 0.36, 1] } }}
                exit={{ opacity: 0, y: -4, transition: { duration: 0.12, ease: [0.22, 0.61, 0.36, 1] } }}
              >
                <DocView slug={doc.slug} />
              </motion.div>
            ) : (
              <motion.div
                key="index"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.18, ease: [0.22, 0.61, 0.36, 1] } }}
                exit={{ opacity: 0, y: -4, transition: { duration: 0.12, ease: [0.22, 0.61, 0.36, 1] } }}
              >
                <IndexView />
              </motion.div>
            )}
          </AnimatePresence>
        </ScrollArea>

        {doc && <DocFooter slug={doc.slug} />}
      </DialogContent>
    </Dialog>
  );
}

/* ── Index (hub) ─────────────────────────────────────────────────────── */

function IndexView() {
  const openDocs = useDocsModal((s) => s.openDocs);
  const grouped = termsByCategory();
  const all = listDocs();

  return (
    <div className="pb-2">
      <h1 className="mb-1 text-xl font-bold text-text-primary">Documentation</h1>
      <p className="mb-6 text-[13px] text-text-tertiary">
        Concepts and terms used across the Syncore Dev Dashboard.
      </p>

      <div className="space-y-5">
        {GLOSSARY_CATEGORIES.map(({ category, title, description }) => {
          const terms = grouped[category] ?? [];
          const primaryDocSlug = terms[0]?.docSlug;
          const doc = primaryDocSlug ? getDoc(primaryDocSlug) : null;
          if (!doc) return null;
          return (
            <div key={category}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <h2 className="text-[14px] font-semibold text-text-primary">
                  {title}
                </h2>
                <button
                  type="button"
                  onClick={() => openDocs(doc.slug)}
                  className="text-[11px] font-medium text-accent transition-colors hover:text-accent-muted"
                >
                  Read →
                </button>
              </div>
              <p className="mb-2 text-[12px] text-text-tertiary">{description}</p>
              <div className="flex flex-wrap gap-1.5">
                {terms.map((term) => (
                  <button
                    key={term.slug}
                    type="button"
                    onClick={() => openDocs(term.docSlug)}
                    className="rounded border border-border bg-bg-elevated px-2 py-0.5 text-[11px] text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary"
                  >
                    {term.title}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 border-t border-border pt-5">
        <h2 className="mb-2.5 text-[12px] font-semibold uppercase tracking-wide text-text-tertiary">
          All documents
        </h2>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {all.map((d) => (
            <button
              key={d.slug}
              type="button"
              onClick={() => openDocs(d.slug)}
              className="truncate rounded-md border border-border bg-bg-surface px-3 py-2 text-left text-[13px] text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary"
            >
              {d.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Single document ─────────────────────────────────────────────────── */

function DocView({ slug }: { slug: string }) {
  const openDocs = useDocsModal((s) => s.openDocs);
  const doc = getDoc(slug);

  if (!doc) {
    return (
      <div className="py-16 text-center">
        <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-bg-elevated text-text-tertiary">
          <FileQuestion size={20} />
        </div>
        <h1 className="text-base font-semibold text-text-primary">
          Document not found
        </h1>
        <p className="mt-1 text-[13px] text-text-tertiary">
          No documentation exists for “{slug}”.
        </p>
        <button
          type="button"
          onClick={() => openDocs(null)}
          className="mt-4 inline-flex items-center gap-1.5 text-[12px] text-accent transition-colors hover:text-accent-muted"
        >
          <ChevronLeft size={14} />
          Back to documentation index
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => openDocs(null)}
        className="mb-3 inline-flex items-center gap-1.5 text-[12px] text-text-tertiary transition-colors hover:text-text-secondary"
      >
        <ChevronLeft size={14} />
        Documentation
      </button>
      <h1 className="mb-4 text-xl font-bold text-text-primary">{doc.title}</h1>
      <Markdown>{doc.body}</Markdown>
    </div>
  );
}

/* ── Prev/next footer ────────────────────────────────────────────────── */

function DocFooter({ slug }: { slug: string }) {
  const openDocs = useDocsModal((s) => s.openDocs);
  const all = listDocs();
  const index = all.findIndex((d) => d.slug === slug);
  const prev = index > 0 ? all[index - 1] : null;
  const next = index >= 0 && index < all.length - 1 ? all[index + 1] : null;

  if (!prev && !next) return null;

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-6 py-3 md:px-8">
      {prev ? (
        <button
          type="button"
          onClick={() => openDocs(prev.slug)}
          className={cn(
            "flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-bg-elevated"
          )}
        >
          <ChevronLeft size={14} className="shrink-0 text-text-tertiary" />
          <span className="min-w-0">
            <span className="block text-[10px] uppercase tracking-wide text-text-tertiary">
              Previous
            </span>
            <span className="block truncate text-[12px] text-text-secondary">
              {prev.title}
            </span>
          </span>
        </button>
      ) : (
        <span />
      )}
      {next ? (
        <button
          type="button"
          onClick={() => openDocs(next.slug)}
          className="flex min-w-0 items-center justify-end gap-2 rounded-md px-2 py-1.5 text-right transition-colors hover:bg-bg-elevated"
        >
          <span className="min-w-0">
            <span className="block text-[10px] uppercase tracking-wide text-text-tertiary">
              Next
            </span>
            <span className="block truncate text-[12px] text-text-secondary">
              {next.title}
            </span>
          </span>
          <ChevronRight size={14} className="shrink-0 text-text-tertiary" />
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}
