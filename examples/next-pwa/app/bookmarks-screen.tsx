"use client";

import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "syncorejs/react";
import { api } from "../syncore/_generated/api";

const TAGS = [
  "read-later",
  "reference",
  "inspiration",
  "tools",
  "learning",
  "news"
] as const;

const TAG_COLORS: Record<string, { bg: string; fg: string; dot: string }> = {
  "read-later": { bg: "#FFF3E6", fg: "#C2691A", dot: "#E8913A" },
  reference: { bg: "#E8F4F0", fg: "#2D6A5A", dot: "#3D8B76" },
  inspiration: { bg: "#F3E8F9", fg: "#7A3E98", dot: "#9B5CB8" },
  tools: { bg: "#E6EFF8", fg: "#2B5A8C", dot: "#4178AE" },
  learning: { bg: "#FFF8E1", fg: "#8C7A2B", dot: "#B59E3A" },
  news: { bg: "#FCE8E8", fg: "#8C2B2B", dot: "#B54242" }
};

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

export function BookmarksScreen() {
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  /* Form state */
  const [formUrl, setFormUrl] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formTag, setFormTag] = useState<string>(TAGS[0]);

  const inputRef = useRef<HTMLInputElement>(null);

  /* Queries */
  const allBookmarks = useQuery(api.bookmarks.list) ?? [];
  const tagBookmarks = useQuery(
    api.bookmarks.listByTag,
    activeTag ? { tag: activeTag } : "skip"
  );
  const searchResults = useQuery(
    api.bookmarks.search,
    searchQuery.trim() ? { query: searchQuery.trim() } : "skip"
  );

  /* Mutations */
  const createBookmark = useMutation(api.bookmarks.create);
  const updateBookmark = useMutation(api.bookmarks.update);
  const toggleStar = useMutation(api.bookmarks.toggleStar);
  const removeBookmark = useMutation(api.bookmarks.remove);

  /* Determine displayed bookmarks */
  const bookmarks = searchQuery.trim()
    ? (searchResults ?? [])
    : activeTag
      ? (tagBookmarks ?? [])
      : allBookmarks;

  const starred = bookmarks.filter((b) => b.starred);
  const rest = bookmarks.filter((b) => !b.starred);

  useEffect(() => {
    if (showAdd && inputRef.current) inputRef.current.focus();
  }, [showAdd]);

  const resetForm = () => {
    setFormUrl("");
    setFormTitle("");
    setFormDesc("");
    setFormTag(TAGS[0]);
    setShowAdd(false);
    setEditingId(null);
  };

  const handleSubmit = async () => {
    if (!formTitle.trim() || !formUrl.trim()) return;
    if (editingId) {
      await updateBookmark({
        id: editingId,
        title: formTitle.trim(),
        description: formDesc.trim(),
        tag: formTag
      });
    } else {
      await createBookmark({
        url: formUrl.trim(),
        title: formTitle.trim(),
        description: formDesc.trim(),
        tag: formTag
      });
    }
    resetForm();
  };

  const handleEdit = (b: (typeof allBookmarks)[0]) => {
    setFormUrl(b.url);
    setFormTitle(b.title);
    setFormDesc(b.description);
    setFormTag(b.tag);
    setEditingId(b._id);
    setShowAdd(true);
  };

  /* Tag counts from allBookmarks (not filtered) */
  const tagCounts: Record<string, number> = {};
  for (const b of allBookmarks) {
    tagCounts[b.tag] = (tagCounts[b.tag] ?? 0) + 1;
  }

  return (
    <main style={styles.main}>
      <div style={styles.container}>
        {/* Header */}
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>Bookmarks</h1>
            <p style={styles.subtitle}>
              {allBookmarks.length} link
              {allBookmarks.length !== 1 ? "s" : ""} saved locally
            </p>
          </div>
          <button
            onClick={() => {
              resetForm();
              setShowAdd(true);
            }}
            type="button"
            style={styles.addBtn}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
            <span>Save link</span>
          </button>
        </header>

        {/* Search */}
        <div style={styles.searchWrap}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#8C8575"
            strokeWidth="2"
            strokeLinecap="round"
            style={{ position: "absolute", left: 14, top: 14, opacity: 0.7 }}
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" />
          </svg>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search bookmarks..."
            style={styles.searchInput}
          />
        </div>

        {/* Tags */}
        <div style={styles.tagBar}>
          <button
            onClick={() => setActiveTag(null)}
            type="button"
            style={{
              ...styles.tagPill,
              background: !activeTag ? "#3D3829" : "transparent",
              color: !activeTag ? "#FAF7F0" : "#6B6456",
              border: !activeTag
                ? "1px solid #3D3829"
                : "1px solid rgba(107,100,86,0.25)"
            }}
          >
            All{" "}
            <span style={{ opacity: 0.6, fontSize: 12 }}>
              {allBookmarks.length}
            </span>
          </button>
          {TAGS.map((tag) => {
            const tc = TAG_COLORS[tag]!;
            const isActive = activeTag === tag;
            return (
              <button
                key={tag}
                onClick={() => setActiveTag(isActive ? null : tag)}
                type="button"
                style={{
                  ...styles.tagPill,
                  background: isActive ? tc.bg : "transparent",
                  color: isActive ? tc.fg : "#6B6456",
                  border: isActive
                    ? `1px solid ${tc.dot}`
                    : "1px solid rgba(107,100,86,0.25)"
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: tc.dot,
                    display: "inline-block",
                    flexShrink: 0
                  }}
                />
                {tag}
                {tagCounts[tag] ? (
                  <span style={{ opacity: 0.6, fontSize: 12 }}>
                    {tagCounts[tag]}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Add/Edit form overlay */}
        {showAdd && (
          <div style={styles.formOverlay} onClick={resetForm}>
            <div style={styles.formCard} onClick={(e) => e.stopPropagation()}>
              <h2 style={styles.formTitle}>
                {editingId ? "Edit bookmark" : "Save a new link"}
              </h2>
              <div style={styles.formFields}>
                <input
                  ref={inputRef}
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://..."
                  style={styles.formInput}
                  disabled={!!editingId}
                />
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Title"
                  style={styles.formInput}
                />
                <textarea
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Why is this worth saving?"
                  rows={2}
                  style={{ ...styles.formInput, resize: "vertical" }}
                />
                <div style={styles.formTagRow}>
                  {TAGS.map((tag) => {
                    const tc = TAG_COLORS[tag]!;
                    const isActive = formTag === tag;
                    return (
                      <button
                        key={tag}
                        onClick={() => setFormTag(tag)}
                        type="button"
                        style={{
                          ...styles.tagPill,
                          fontSize: 12,
                          padding: "4px 10px",
                          background: isActive ? tc.bg : "transparent",
                          color: isActive ? tc.fg : "#8C8575",
                          border: isActive
                            ? `1px solid ${tc.dot}`
                            : "1px solid rgba(107,100,86,0.2)"
                        }}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={styles.formActions}>
                <button
                  onClick={resetForm}
                  type="button"
                  style={styles.cancelBtn}
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleSubmit()}
                  type="button"
                  style={styles.saveBtn}
                >
                  {editingId ? "Update" : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Starred section */}
        {starred.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <h3 style={styles.sectionLabel}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="#B59E3A"
                stroke="none"
              >
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              Starred
            </h3>
            <div style={styles.grid}>
              {starred.map((b) => (
                <BookmarkCard
                  key={b._id}
                  bookmark={b}
                  onToggleStar={() => void toggleStar({ id: b._id })}
                  onRemove={() => void removeBookmark({ id: b._id })}
                  onEdit={() => handleEdit(b)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Rest */}
        {rest.length > 0 && (
          <section>
            {starred.length > 0 && (
              <h3 style={styles.sectionLabel}>
                {activeTag ?? "Everything else"}
              </h3>
            )}
            <div style={styles.grid}>
              {rest.map((b) => (
                <BookmarkCard
                  key={b._id}
                  bookmark={b}
                  onToggleStar={() => void toggleStar({ id: b._id })}
                  onRemove={() => void removeBookmark({ id: b._id })}
                  onEdit={() => handleEdit(b)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Empty */}
        {bookmarks.length === 0 && (
          <div style={styles.empty}>
            <p style={{ fontSize: 40, marginBottom: 8 }}>
              {searchQuery ? "O" : "/"}
            </p>
            <p
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: 18,
                color: "#3D3829"
              }}
            >
              {searchQuery
                ? "No bookmarks match your search"
                : activeTag
                  ? `No ${activeTag} bookmarks yet`
                  : "Start saving links"}
            </p>
            <p style={{ color: "#8C8575", fontSize: 14, maxWidth: 280 }}>
              {searchQuery
                ? "Try different keywords"
                : 'Click "Save link" to add your first bookmark. Everything is stored locally in your browser.'}
            </p>
          </div>
        )}

        {/* Footer */}
        <footer style={styles.footer}>
          <span>
            Powered by <strong style={{ color: "#3D3829" }}>Syncore</strong>
          </span>
          <span style={{ opacity: 0.5 }}>|</span>
          <span>All data stored locally</span>
        </footer>
      </div>
    </main>
  );
}

/* ---------- Bookmark Card ---------- */

interface BookmarkCardProps {
  bookmark: {
    _id: string;
    url: string;
    title: string;
    description: string;
    tag: string;
    starred: boolean;
    createdAt: number;
  };
  onToggleStar: () => void;
  onRemove: () => void;
  onEdit: () => void;
}

function BookmarkCard({
  bookmark,
  onToggleStar,
  onRemove,
  onEdit
}: BookmarkCardProps) {
  const tc = TAG_COLORS[bookmark.tag] ?? TAG_COLORS["read-later"]!;
  const [hovered, setHovered] = useState(false);

  return (
    <article
      style={{
        ...styles.card,
        borderLeft: `3px solid ${tc.dot}`,
        background: hovered ? "#FDFBF6" : "#FEFCF7",
        transform: hovered ? "translateY(-1px)" : "none",
        boxShadow: hovered
          ? "0 4px 20px rgba(61,56,41,0.10)"
          : "0 1px 4px rgba(61,56,41,0.06)"
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={styles.cardTop}>
        <span
          style={{
            ...styles.tagBadge,
            background: tc.bg,
            color: tc.fg
          }}
        >
          {bookmark.tag}
        </span>
        <span style={styles.cardTime}>{timeAgo(bookmark.createdAt)}</span>
      </div>

      <a
        href={bookmark.url}
        target="_blank"
        rel="noopener noreferrer"
        style={styles.cardTitle}
      >
        {bookmark.title}
      </a>

      {bookmark.description && (
        <p style={styles.cardDesc}>{bookmark.description}</p>
      )}

      <div style={styles.cardBottom}>
        <span style={styles.cardDomain}>{extractDomain(bookmark.url)}</span>

        <div
          style={{
            ...styles.cardActions,
            opacity: hovered ? 1 : 0
          }}
        >
          <button
            onClick={onToggleStar}
            type="button"
            style={styles.iconBtn}
            title={bookmark.starred ? "Unstar" : "Star"}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill={bookmark.starred ? "#B59E3A" : "none"}
              stroke={bookmark.starred ? "#B59E3A" : "#8C8575"}
              strokeWidth="2"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
          <button
            onClick={onEdit}
            type="button"
            style={styles.iconBtn}
            title="Edit"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#8C8575"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button
            onClick={onRemove}
            type="button"
            style={styles.iconBtn}
            title="Delete"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#B54242"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>
    </article>
  );
}

/* ---------- Styles ---------- */

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: "100vh",
    background: "#F5F1E8",
    fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif"
  },
  container: {
    maxWidth: 860,
    margin: "0 auto",
    padding: "48px 24px"
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 28,
    flexWrap: "wrap",
    gap: 16
  },
  title: {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: 38,
    fontWeight: 700,
    color: "#2A2520",
    margin: 0,
    lineHeight: 1.1,
    letterSpacing: "-0.02em"
  },
  subtitle: {
    color: "#8C8575",
    fontSize: 14,
    margin: "6px 0 0",
    letterSpacing: "0.03em"
  },
  addBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "10px 18px",
    borderRadius: 10,
    border: "none",
    background: "#3D3829",
    color: "#FAF7F0",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    letterSpacing: "0.01em"
  },
  searchWrap: {
    position: "relative" as const,
    marginBottom: 16
  },
  searchInput: {
    width: "100%",
    padding: "12px 14px 12px 40px",
    borderRadius: 10,
    border: "1px solid rgba(107,100,86,0.18)",
    background: "#FEFCF7",
    color: "#2A2520",
    fontSize: 14,
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box" as const
  },
  tagBar: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap" as const,
    marginBottom: 28,
    paddingBottom: 20,
    borderBottom: "1px solid rgba(107,100,86,0.12)"
  },
  tagPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "5px 12px",
    borderRadius: 20,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap" as const,
    transition: "all 0.15s"
  },
  sectionLabel: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    color: "#6B6456",
    marginBottom: 14
  },
  grid: {
    display: "grid",
    gap: 12
  },
  card: {
    padding: "16px 20px",
    borderRadius: 10,
    transition: "all 0.18s ease",
    cursor: "default"
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8
  },
  tagBadge: {
    fontSize: 11,
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: 6,
    letterSpacing: "0.04em"
  },
  cardTime: {
    fontSize: 12,
    color: "#8C8575"
  },
  cardTitle: {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: 17,
    fontWeight: 600,
    color: "#2A2520",
    lineHeight: 1.35,
    textDecoration: "none",
    display: "block",
    marginBottom: 4
  },
  cardDesc: {
    fontSize: 13,
    color: "#6B6456",
    lineHeight: 1.5,
    margin: "0 0 10px"
  },
  cardBottom: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  cardDomain: {
    fontSize: 12,
    color: "#A09A8C",
    fontFamily: "'DM Mono', 'Courier New', monospace",
    letterSpacing: "0.02em"
  },
  cardActions: {
    display: "flex",
    gap: 4,
    transition: "opacity 0.18s ease"
  },
  iconBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "4px 6px",
    borderRadius: 6,
    display: "flex",
    alignItems: "center"
  },
  formOverlay: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(42,37,32,0.35)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    padding: 24
  },
  formCard: {
    background: "#FEFCF7",
    borderRadius: 14,
    padding: 28,
    width: "100%",
    maxWidth: 480,
    boxShadow: "0 16px 48px rgba(42,37,32,0.18)"
  },
  formTitle: {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: 22,
    fontWeight: 700,
    color: "#2A2520",
    margin: "0 0 20px"
  },
  formFields: {
    display: "grid",
    gap: 12
  },
  formInput: {
    width: "100%",
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid rgba(107,100,86,0.2)",
    background: "#FAF7F0",
    color: "#2A2520",
    fontSize: 14,
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box" as const
  },
  formTagRow: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap" as const,
    marginTop: 4
  },
  formActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 20
  },
  cancelBtn: {
    padding: "8px 16px",
    borderRadius: 8,
    border: "1px solid rgba(107,100,86,0.2)",
    background: "transparent",
    color: "#6B6456",
    fontSize: 14,
    cursor: "pointer",
    fontFamily: "inherit"
  },
  saveBtn: {
    padding: "8px 20px",
    borderRadius: 8,
    border: "none",
    background: "#3D3829",
    color: "#FAF7F0",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit"
  },
  empty: {
    textAlign: "center" as const,
    padding: "60px 20px",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 4
  },
  footer: {
    display: "flex",
    justifyContent: "center",
    gap: 8,
    marginTop: 48,
    paddingTop: 20,
    borderTop: "1px solid rgba(107,100,86,0.1)",
    fontSize: 12,
    color: "#A09A8C"
  }
};
