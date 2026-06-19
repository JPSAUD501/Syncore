import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useDocsModal } from "@/lib/docsModal";
import { cn } from "@/lib/utils";

interface MarkdownProps {
  /** Raw markdown source. */
  children: string;
  className?: string;
}

/**
 * Renders markdown documentation content using the project's design tokens.
 *
 * - GitHub-flavored markdown (tables, strikethrough, task lists) via remark-gfm.
 * - Internal links of the form `/docs/<slug>` open the in-app docs modal (via
 *   the `docsModal` store) instead of navigating a route.
 * - External links open in a new tab.
 *
 * Styling lives under the `.prose-docs` class in `src/app.css` so this stays
 * dependency-free (no `@tailwindcss/typography`).
 */
export function Markdown({ children, className }: MarkdownProps) {
  const openDocs = useDocsModal((s) => s.openDocs);

  const components = useMemo(
    () => ({
      a({ href, children, ...props }: React.ComponentProps<"a">) {
        if (!href) return <a {...props}>{children}</a>;
        // Internal docs links → open the docs modal.
        if (href.startsWith("/docs")) {
          const slug = href.replace(/^\/docs\/?/, "");
          return (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault();
                openDocs(slug || null);
              }}
              {...props}
            >
              {children}
            </a>
          );
        }
        // External link → new tab.
        if (/^https?:\/\//.test(href)) {
          return (
            <a href={href} target="_blank" rel="noreferrer" {...props}>
              {children}
            </a>
          );
        }
        return (
          <a href={href} {...props}>
            {children}
          </a>
        );
      }
    }),
    [openDocs]
  );

  return (
    <div className={cn("prose-docs", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
