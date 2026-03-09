import { SyncoreElectronProvider } from "syncore/node/ipc/react";
import { useMutation, useQuery } from "syncore/react";
import { useState, useRef, useEffect, useCallback } from "react";
import { api } from "../../syncore/_generated/api";

const MOODS = ["great", "good", "okay", "low", "rough"] as const;

const MOOD_EMOJI: Record<string, string> = {
  great: "\u2728",
  good: "\u263A",
  okay: "\u2013",
  low: "\u2601",
  rough: "\u26A1"
};

const MOOD_LABEL: Record<string, string> = {
  great: "Great",
  good: "Good",
  okay: "Okay",
  low: "Low",
  rough: "Rough"
};

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(dateStr: string): {
  weekday: string;
  day: string;
  month: string;
  year: string;
} {
  const d = new Date(dateStr + "T12:00:00");
  return {
    weekday: d.toLocaleDateString("en-US", { weekday: "long" }),
    day: d.toLocaleDateString("en-US", { day: "numeric" }),
    month: d.toLocaleDateString("en-US", { month: "long" }),
    year: d.toLocaleDateString("en-US", { year: "numeric" })
  };
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function App() {
  return (
    <SyncoreElectronProvider>
      <JournalScreen />
    </SyncoreElectronProvider>
  );
}

function JournalScreen() {
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [body, setBody] = useState("");
  const [mood, setMood] = useState<string>("okay");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Queries */
  const allEntries = useQuery(api.entries.list) ?? [];
  const currentEntry = useQuery(api.entries.getByDate, { date: selectedDate });
  const searchResults = useQuery(
    api.entries.search,
    showSearch && searchQuery.trim() ? { query: searchQuery.trim() } : "skip"
  );

  /* Mutations */
  const upsertEntry = useMutation(api.entries.upsert);
  const removeEntry = useMutation(api.entries.remove);

  /* Sync editor from loaded entry */
  useEffect(() => {
    if (currentEntry) {
      setBody(currentEntry.body);
      setMood(currentEntry.mood);
    } else {
      setBody("");
      setMood("okay");
    }
  }, [currentEntry]);

  /* Auto-save with debounce */
  const scheduleSave = useCallback(
    (newBody: string, newMood: string) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        void upsertEntry({ date: selectedDate, body: newBody, mood: newMood });
      }, 800);
    },
    [selectedDate, upsertEntry]
  );

  const handleBodyChange = (newBody: string) => {
    setBody(newBody);
    scheduleSave(newBody, mood);
  };

  const handleMoodChange = (newMood: string) => {
    setMood(newMood);
    if (body.trim()) {
      scheduleSave(body, newMood);
    }
  };

  const handleDateSelect = (date: string) => {
    /* Save current before switching */
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (body.trim()) {
      void upsertEntry({ date: selectedDate, body, mood });
    }
    setSelectedDate(date);
    setShowSearch(false);
  };

  const handleDelete = async () => {
    if (!currentEntry) return;
    await removeEntry({ id: currentEntry._id });
    setBody("");
    setMood("okay");
  };

  const isToday = selectedDate === todayStr();
  const dateParts = formatDate(selectedDate);
  const wordCount = countWords(body);

  /* Compute streak */
  const entryDates = new Set(allEntries.map((e) => e.date));
  let streak = 0;
  const d = new Date();
  while (true) {
    const ds = d.toISOString().slice(0, 10);
    if (entryDates.has(ds)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else if (ds === todayStr()) {
      /* Today not written yet — don't break streak */
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }

  return (
    <div className="journal">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2 className="sidebar-title">Journal</h2>
          <button
            className="icon-btn"
            onClick={() => setShowSearch(!showSearch)}
            title="Search entries"
            type="button"
          >
            {showSearch ? "\u2715" : "\u2315"}
          </button>
        </div>

        {showSearch && (
          <div className="search-box">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search entries..."
              className="search-input"
              autoFocus
            />
          </div>
        )}

        {/* Stats bar */}
        <div className="stats-bar">
          <div className="stat">
            <span className="stat-value">{allEntries.length}</span>
            <span className="stat-label">entries</span>
          </div>
          <div className="stat">
            <span className="stat-value">{streak}</span>
            <span className="stat-label">day streak</span>
          </div>
          <div className="stat">
            <span className="stat-value">
              {allEntries.reduce((s, e) => s + e.wordCount, 0).toLocaleString()}
            </span>
            <span className="stat-label">words</span>
          </div>
        </div>

        {/* Entry list */}
        <div className="entry-list">
          {/* "Today" shortcut */}
          {!showSearch && !entryDates.has(todayStr()) && (
            <button
              className={`entry-item entry-item--new ${selectedDate === todayStr() ? "entry-item--active" : ""}`}
              onClick={() => handleDateSelect(todayStr())}
              type="button"
            >
              <span className="entry-item-date">Today</span>
              <span className="entry-item-hint">Start writing</span>
            </button>
          )}

          {(showSearch && searchQuery.trim()
            ? (searchResults ?? [])
            : allEntries
          ).map((entry) => {
            const ep = formatDate(entry.date);
            const isActive = selectedDate === entry.date;
            return (
              <button
                key={entry._id}
                className={`entry-item ${isActive ? "entry-item--active" : ""}`}
                onClick={() => handleDateSelect(entry.date)}
                type="button"
              >
                <div className="entry-item-top">
                  <span className="entry-item-date">
                    {entry.date === todayStr()
                      ? "Today"
                      : `${ep.month} ${ep.day}`}
                  </span>
                  <span className="entry-item-mood">
                    {MOOD_EMOJI[entry.mood] ?? ""}
                  </span>
                </div>
                <span className="entry-item-preview">
                  {entry.body.slice(0, 64)}
                  {entry.body.length > 64 ? "..." : ""}
                </span>
                <span className="entry-item-meta">
                  {entry.wordCount} word{entry.wordCount !== 1 ? "s" : ""}
                </span>
              </button>
            );
          })}

          {allEntries.length === 0 && !showSearch && (
            <div className="empty-sidebar">
              Your journal is empty. Start writing today.
            </div>
          )}

          {showSearch &&
            searchQuery.trim() &&
            (searchResults ?? []).length === 0 && (
              <div className="empty-sidebar">No entries match your search.</div>
            )}
        </div>
      </aside>

      {/* Main editor */}
      <main className="editor">
        <div className="editor-header">
          <div>
            <h1 className="editor-date">
              {isToday ? "Today" : `${dateParts.weekday}`}
            </h1>
            <p className="editor-date-full">
              {dateParts.month} {dateParts.day}, {dateParts.year}
            </p>
          </div>
          <div className="editor-actions">
            {currentEntry && (
              <button
                className="delete-btn"
                onClick={() => void handleDelete()}
                type="button"
                title="Delete entry"
              >
                Delete
              </button>
            )}
          </div>
        </div>

        {/* Mood selector */}
        <div className="mood-row">
          <span className="mood-label">Mood</span>
          <div className="mood-options">
            {MOODS.map((m) => (
              <button
                key={m}
                className={`mood-btn ${mood === m ? "mood-btn--active" : ""}`}
                onClick={() => handleMoodChange(m)}
                type="button"
                title={MOOD_LABEL[m]}
              >
                {MOOD_EMOJI[m]}
              </button>
            ))}
          </div>
        </div>

        {/* Writing area */}
        <textarea
          ref={textareaRef}
          className="editor-textarea"
          value={body}
          onChange={(e) => handleBodyChange(e.target.value)}
          placeholder="What happened today? How are you feeling?"
        />

        {/* Bottom bar */}
        <div className="editor-footer">
          <span>
            {wordCount} word{wordCount !== 1 ? "s" : ""}
          </span>
          <span className="save-indicator">
            {currentEntry ? "Saved locally" : body.trim() ? "Saving..." : ""}
          </span>
        </div>
      </main>
    </div>
  );
}
