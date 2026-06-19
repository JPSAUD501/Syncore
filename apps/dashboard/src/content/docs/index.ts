/**
 * Documentation manifest.
 *
 * Markdown files under this directory are imported as raw strings at build time
 * via `import.meta.glob`, keyed by their filename (without extension) — the
 * `docSlug`. This keeps docs local-first (no network fetch) and type-checkable
 * via `getDoc()`.
 *
 * The `glossary.test.ts` guard-rail asserts that every `docSlug` referenced
 * from the glossary registry resolves here, so dangling "Learn more" links are
 * caught at test time rather than at runtime.
 */

export interface DocEntry {
  /** Slug derived from the markdown filename, e.g. `storage-protocols`. */
  slug: string;
  /** Title parsed from the first `# ` heading (falls back to the slug). */
  title: string;
  /** Raw markdown body (frontmatter/heading stripped of the title line). */
  body: string;
}

// Vite eagerly imports every `.md` file in this directory as a raw string.
// `Record<relativePath, string>`.
const RAW_DOCS = import.meta.glob("./*.md", {
  eager: true,
  query: "?raw",
  import: "default"
}) as Record<string, string>;

/**
 * Title-case a heading: capitalize the first letter of every word, leaving
 * already-uppercase words (acronyms like "SQL", "ID") intact. Words after "&"
 * are also capitalized.
 */
function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .map((word) => {
      // Keep acronyms / all-caps tokens as-is.
      if (word.length > 1 && word === word.toUpperCase()) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function extractTitle(markdown: string): { title: string; body: string } {
  const lines = markdown.replace(/^\uFEFF/, "").split(/\r?\n/);
  let title = "";
  let firstHeadingIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const match = line.match(/^\s*#\s+(.+?)\s*$/);
    if (match) {
      title = titleCase((match[1] ?? "").trim());
      firstHeadingIndex = i;
      break;
    }
  }

  // Drop the first `# Title` line from the rendered body to avoid duplicating
  // the title (the docs page renders its own <h1>).
  const body =
    firstHeadingIndex >= 0
      ? [...lines.slice(0, firstHeadingIndex), ...lines.slice(firstHeadingIndex + 1)]
          .join("\n")
          .trim()
      : markdown.trim();

  return { title, body };
}

function slugFromPath(path: string): string {
  // Paths look like `./storage-protocols.md`.
  const file = path.split("/").pop() ?? path;
  return file.replace(/\.md$/i, "");
}

const DOCS: Record<string, DocEntry> = {};
for (const [path, raw] of Object.entries(RAW_DOCS)) {
  const slug = slugFromPath(path);
  const { title, body } = extractTitle(raw);
  DOCS[slug] = { slug, title: title || slug, body };
}

/** Look up a document by its slug. Returns `null` when it doesn't exist. */
export function getDoc(slug: string): DocEntry | null {
  return DOCS[slug] ?? null;
}

/** All documents, sorted alphabetically by title. */
export function listDocs(): DocEntry[] {
  return Object.values(DOCS).sort((a, b) => a.title.localeCompare(b.title));
}

/** Whether a given doc slug exists (used by the glossary guard-rail test). */
export function hasDoc(slug: string): boolean {
  return slug in DOCS;
}
