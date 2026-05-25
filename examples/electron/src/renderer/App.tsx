import { SyncoreElectronProvider } from "syncorejs/node/ipc/react";
import { skip, useMutation, useQuery, useSyncoreStatus } from "syncorejs/react";
import { useCallback, useEffect, useRef, useState } from "react";
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

function getMoodLabel(mood: string): string {
  return MOOD_LABEL[mood] ?? mood;
}

const PROMPTS = [
  "What felt easier than expected today?",
  "What should I remember from this session?",
  "What is one thing I want to improve tomorrow?"
];

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
  const runtimeStatus = useSyncoreStatus();
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [body, setBody] = useState("");
  const [mood, setMood] = useState<string>("okay");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [moodFilter, setMoodFilter] = useState<string | null>(null);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allEntries = useQuery(api.entries.list) ?? [];
  const stats = useQuery(api.entries.stats);
  const currentEntry = useQuery(api.entries.getByDate, { date: selectedDate });
  const searchResults = useQuery(
    api.entries.search,
    showSearch && searchQuery.trim() ? { query: searchQuery.trim() } : skip
  );
  const moodEntries = useQuery(
    api.entries.byMood,
    moodFilter ? { mood: moodFilter } : skip
  );

  const upsertEntry = useMutation(api.entries.upsert);
  const removeEntry = useMutation(api.entries.remove);
  const seedDemo = useMutation(api.entries.seedDemo);

  useEffect(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (currentEntry) {
      setBody(currentEntry.body);
      setMood(currentEntry.mood);
    } else {
      setBody("");
      setMood("okay");
    }
  }, [
    currentEntry?._id,
    currentEntry?.body,
    currentEntry?.mood,
    selectedDate
  ]);

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
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (body.trim()) {
      void upsertEntry({ date: selectedDate, body, mood });
    }
    setSelectedDate(date);
    setShowSearch(false);
    setMoodFilter(null);
  };

  const shiftDate = (days: number) => {
    const d = new Date(selectedDate + "T12:00:00");
    d.setDate(d.getDate() + days);
    handleDateSelect(d.toISOString().slice(0, 10));
  };

  const handleDelete = async () => {
    if (!currentEntry) return;
    await removeEntry({ id: currentEntry._id });
    setBody("");
    setMood("okay");
  };

  const entryDates = new Set(allEntries.map((e) => e.date));
  const isToday = selectedDate === todayStr();
  const dateParts = formatDate(selectedDate);
  const wordCount = countWords(body);
  const visibleEntries =
    showSearch && searchQuery.trim()
      ? (searchResults ?? [])
      : moodFilter
        ? (moodEntries ?? [])
        : allEntries;
  const lastUpdatedLabel = stats?.lastUpdatedAt
    ? new Date(stats.lastUpdatedAt).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit"
      })
    : null;

  return (
    <div className="journal">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div>
            <h2 className="sidebar-title">Journal</h2>
            <span className={`runtime-pill runtime-pill--${runtimeStatus.kind}`}>
              {runtimeStatus.kind === "ready" ? "Local first" : runtimeStatus.kind}
            </span>
          </div>
          <div className="sidebar-actions">
            <button
              className="icon-btn"
              onClick={() => {
                setShowSearch(!showSearch);
                setMoodFilter(null);
              }}
              title="Search entries"
              type="button"
            >
              {showSearch ? "\u2715" : "\u2315"}
            </button>
            <button
              className="icon-btn"
              onClick={() => void seedDemo()}
              title="Add sample entries"
              type="button"
            >
              +
            </button>
          </div>
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

        <div className="stats-bar">
          <div className="stat">
            <span className="stat-value">{stats?.entryCount ?? allEntries.length}</span>
            <span className="stat-label">entries</span>
          </div>
          <div className="stat">
            <span className="stat-value">{stats?.streak ?? 0}</span>
            <span className="stat-label">day streak</span>
          </div>
          <div className="stat">
            <span className="stat-value">
              {(stats?.totalWords ?? 0).toLocaleString()}
            </span>
            <span className="stat-label">words</span>
          </div>
        </div>

        <div className="mood-filter">
          {MOODS.map((m) => (
            <button
              key={m}
              className={`mood-filter-btn ${moodFilter === m ? "mood-filter-btn--active" : ""}`}
              onClick={() => {
                setMoodFilter(moodFilter === m ? null : m);
                setShowSearch(false);
              }}
              type="button"
              title={`Show ${getMoodLabel(m).toLowerCase()} entries`}
            >
              <span>{MOOD_EMOJI[m]}</span>
              <span>{stats?.moodCounts?.[m] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="entry-list">
          {!showSearch && !moodFilter && !entryDates.has(todayStr()) && (
            <button
              className={`entry-item entry-item--new ${selectedDate === todayStr() ? "entry-item--active" : ""}`}
              onClick={() => handleDateSelect(todayStr())}
              type="button"
            >
              <span className="entry-item-date">Today</span>
              <span className="entry-item-hint">Start writing</span>
            </button>
          )}

          {visibleEntries.map((entry) => {
            const ep = formatDate(entry.date);
            const isActive = selectedDate === entry.date;
            const entryWordCount = countWords(entry.body);
            return (
              <button
                key={entry._id}
                className={`entry-item ${isActive ? "entry-item--active" : ""}`}
                onClick={() => handleDateSelect(entry.date)}
                type="button"
              >
                <div className="entry-item-top">
                  <span className="entry-item-date">
                    {entry.date === todayStr() ? "Today" : `${ep.month} ${ep.day}`}
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
                  {entryWordCount} word{entryWordCount !== 1 ? "s" : ""}
                </span>
              </button>
            );
          })}

          {allEntries.length === 0 && !showSearch && !moodFilter && (
            <div className="empty-sidebar">
              Your journal is empty. Start writing today or add sample entries.
            </div>
          )}

          {showSearch &&
            searchQuery.trim() &&
            (searchResults ?? []).length === 0 && (
              <div className="empty-sidebar">No entries match your search.</div>
            )}

          {moodFilter && (moodEntries ?? []).length === 0 && (
            <div className="empty-sidebar">
              No {getMoodLabel(moodFilter).toLowerCase()} entries yet.
            </div>
          )}
        </div>
      </aside>

      <main className="editor">
        <div className="editor-header">
          <div>
            <div className="date-nav">
              <button type="button" onClick={() => shiftDate(-1)}>
                Previous day
              </button>
              <button type="button" onClick={() => handleDateSelect(todayStr())}>
                Today
              </button>
              <button type="button" onClick={() => shiftDate(1)}>
                Next day
              </button>
            </div>
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

        <div className="prompt-row">
          {PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() =>
                handleBodyChange(
                  body.trim() ? `${body.trim()}\n\n${prompt}\n` : `${prompt}\n`
                )
              }
            >
              {prompt}
            </button>
          ))}
        </div>

        <textarea
          className="editor-textarea"
          value={body}
          onChange={(e) => handleBodyChange(e.target.value)}
          placeholder="What happened today? How are you feeling?"
        />

        <div className="editor-footer">
          <span>
            {wordCount} word{wordCount !== 1 ? "s" : ""}
          </span>
          <span className="save-indicator">
            {currentEntry
              ? `Saved locally${lastUpdatedLabel ? ` at ${lastUpdatedLabel}` : ""}`
              : body.trim()
                ? "Saving..."
                : ""}
          </span>
        </div>
      </main>
    </div>
  );
}
