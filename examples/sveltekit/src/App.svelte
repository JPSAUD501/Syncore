<script lang="ts">
  import { onDestroy } from "svelte";
  import { createMutation, createQueryStore, setSyncoreClient } from "syncore/svelte";
  import { createBrowserWorkerClient } from "syncore/browser";
  import { api } from "../syncore/_generated/api";

  const managed = createBrowserWorkerClient({
    workerUrl: new URL("./syncore.worker.ts", import.meta.url)
  });

  setSyncoreClient(managed.client);

  /* Queries */
  const habitsStore = createQueryStore(api.habits.listHabits);
  const completionsStore = createQueryStore(api.habits.listCompletions);

  /* Mutations */
  const createHabit = createMutation(api.habits.createHabit);
  const toggleCompletion = createMutation(api.habits.toggleCompletion);
  const archiveHabit = createMutation(api.habits.archiveHabit);

  /* Form state */
  let showForm = false;
  let draftName = "";
  let draftIcon = "\u{1F3AF}";
  let draftColor = "#5DE4C7";

  const PRESET_ICONS = [
    "\u{1F3AF}", "\u{1F4AA}", "\u{1F4DA}", "\u{1F9D8}", "\u{1F6B6}", "\u{1F4A7}", "\u{1F34E}", "\u{2708}\uFE0F",
    "\u{270D}\uFE0F", "\u{1F3C3}", "\u{1F3B5}", "\u{1F4BB}", "\u{1F6CC}", "\u{1F48A}"
  ];

  const PRESET_COLORS = [
    "#5DE4C7", "#7C93F3", "#F2A65A", "#E06C75", "#C68FDD", "#57C785", "#ED8796", "#8AADF4"
  ];

  function todayStr(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** Get last N dates as strings. */
  function lastNDates(n: number): string[] {
    const dates: string[] = [];
    const d = new Date();
    for (let i = 0; i < n; i++) {
      dates.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() - 1);
    }
    return dates;
  }

  function formatShortDate(dateStr: string): string {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-US", { weekday: "narrow" });
  }

  function formatDayNum(dateStr: string): string {
    return new Date(dateStr + "T12:00:00").getDate().toString();
  }

  async function handleCreate() {
    if (!draftName.trim()) return;
    await createHabit({ name: draftName.trim(), icon: draftIcon, color: draftColor });
    draftName = "";
    draftIcon = "\u{1F3AF}";
    draftColor = "#5DE4C7";
    showForm = false;
  }

  /* Compute current streak for a habit */
  function computeStreak(habitId: string, completionSet: Set<string>): number {
    let streak = 0;
    const d = new Date();
    while (true) {
      const ds = d.toISOString().slice(0, 10);
      const key = `${habitId}:${ds}`;
      if (completionSet.has(key)) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else if (ds === todayStr()) {
        /* Today not done yet — skip without breaking */
        d.setDate(d.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }

  onDestroy(() => {
    managed.dispose();
  });

  /* Reactive bindings */
  $: habitState = $habitsStore;
  $: completionState = $completionsStore;
  $: habits = habitState.data ?? [];
  $: completions = completionState.data ?? [];
  $: loading = habitState.status === "loading";

  /* Build a set of "habitId:date" for quick lookups */
  $: completionSet = new Set<string>(completions.map((c: { habitId: string; date: string }) => `${c.habitId}:${c.date}`));

  $: last7 = lastNDates(7);

  /* Overall stats */
  $: totalCompletions = completions.length;
  $: todayCompletions = completions.filter((c: { date: string }) => c.date === todayStr()).length;
  $: bestStreak = habits.reduce((max: number, h: { _id: string }) => Math.max(max, computeStreak(h._id, completionSet)), 0);
</script>

<svelte:head>
  <title>Habits — Syncore</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />
</svelte:head>

<main>
  <!-- Header -->
  <header>
    <div>
      <h1>Habits</h1>
      <p class="subtitle">{habits.length} habit{habits.length !== 1 ? "s" : ""} tracked locally</p>
    </div>
    <button class="add-btn" on:click={() => (showForm = !showForm)}>
      <span class="add-icon">{showForm ? "\u2715" : "+"}</span>
      <span>{showForm ? "Cancel" : "New habit"}</span>
    </button>
  </header>

  <!-- Stats row -->
  <div class="stats-row">
    <div class="stat-card">
      <span class="stat-value">{todayCompletions}<span class="stat-of">/{habits.length}</span></span>
      <span class="stat-label">Today</span>
    </div>
    <div class="stat-card">
      <span class="stat-value">{totalCompletions}</span>
      <span class="stat-label">Total check-ins</span>
    </div>
    <div class="stat-card">
      <span class="stat-value">{bestStreak}</span>
      <span class="stat-label">Best streak</span>
    </div>
  </div>

  <!-- New habit form -->
  {#if showForm}
    <div class="form-card">
      <input
        bind:value={draftName}
        placeholder="Habit name"
        class="form-input"
      />
      <div class="form-row">
        <span class="form-label">Icon</span>
        <div class="preset-row">
          {#each PRESET_ICONS as icon}
            <button
              class="preset-btn {draftIcon === icon ? 'preset-btn--active' : ''}"
              on:click={() => (draftIcon = icon)}
            >{icon}</button>
          {/each}
        </div>
      </div>
      <div class="form-row">
        <span class="form-label">Color</span>
        <div class="preset-row">
          {#each PRESET_COLORS as color}
            <button
              class="color-btn {draftColor === color ? 'color-btn--active' : ''}"
              style="background: {color}"
              on:click={() => (draftColor = color)}
            ></button>
          {/each}
        </div>
      </div>
      <button class="save-btn" on:click={() => void handleCreate()}>Create habit</button>
    </div>
  {/if}

  <!-- Loading -->
  {#if loading}
    <p class="loading">Booting local runtime...</p>
  {/if}

  <!-- Habit grid -->
  {#if habits.length > 0}
    <div class="habit-grid">
      {#each habits as habit (habit._id)}
        {@const streak = computeStreak(habit._id, completionSet)}
        <div class="habit-card" style="--accent: {habit.color}">
          <div class="habit-top">
            <div class="habit-identity">
              <span class="habit-icon">{habit.icon}</span>
              <div>
                <div class="habit-name">{habit.name}</div>
                {#if streak > 0}
                  <div class="habit-streak">{streak} day streak</div>
                {/if}
              </div>
            </div>
            <button
              class="archive-btn"
              on:click={() => void archiveHabit({ id: habit._id })}
              title="Archive habit"
            >&times;</button>
          </div>

          <!-- 7-day grid -->
          <div class="week-grid">
            {#each last7.slice().reverse() as date}
              {@const done = completionSet.has(`${habit._id}:${date}`)}
              {@const isToday = date === todayStr()}
              <button
                class="day-cell {done ? 'day-cell--done' : ''} {isToday ? 'day-cell--today' : ''}"
                on:click={() => void toggleCompletion({ habitId: habit._id, date })}
                title="{date}"
              >
                <span class="day-label">{formatShortDate(date)}</span>
                <span class="day-num">{formatDayNum(date)}</span>
                {#if done}
                  <span class="day-check">{"\u2713"}</span>
                {/if}
              </button>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {:else if !loading}
    <div class="empty">
      <p class="empty-icon">/</p>
      <p class="empty-title">No habits yet</p>
      <p class="empty-desc">Create your first habit to start tracking daily progress. Everything stays local.</p>
    </div>
  {/if}

  <footer>
    <span>Powered by <strong>Syncore</strong></span>
    <span class="dot">&#183;</span>
    <span>All data stored locally</span>
  </footer>
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: 'Outfit', system-ui, sans-serif;
    background: #0D1117;
    color: #E6E1D6;
    -webkit-font-smoothing: antialiased;
  }

  :global(*) {
    box-sizing: border-box;
  }

  main {
    max-width: 720px;
    margin: 0 auto;
    padding: 40px 20px 60px;
  }

  /* Header */
  header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 24px;
    flex-wrap: wrap;
    gap: 12px;
  }

  h1 {
    font-size: 34px;
    font-weight: 700;
    margin: 0;
    letter-spacing: -0.03em;
    line-height: 1.1;
  }

  .subtitle {
    font-size: 13px;
    color: #6B7280;
    margin: 4px 0 0;
    font-family: 'Space Mono', monospace;
    letter-spacing: 0.02em;
  }

  .add-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border-radius: 8px;
    border: 1px solid rgba(93, 228, 199, 0.25);
    background: rgba(93, 228, 199, 0.08);
    color: #5DE4C7;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.15s;
  }

  .add-btn:hover {
    background: rgba(93, 228, 199, 0.15);
  }

  .add-icon {
    font-size: 16px;
    line-height: 1;
  }

  /* Stats */
  .stats-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-bottom: 24px;
  }

  .stat-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .stat-value {
    font-family: 'Space Mono', monospace;
    font-size: 22px;
    font-weight: 700;
    color: #E6E1D6;
  }

  .stat-of {
    font-size: 14px;
    color: #6B7280;
    font-weight: 400;
  }

  .stat-label {
    font-size: 11px;
    color: #6B7280;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-family: 'Space Mono', monospace;
  }

  /* Form */
  .form-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(93, 228, 199, 0.12);
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 24px;
    display: grid;
    gap: 14px;
  }

  .form-input {
    width: 100%;
    padding: 10px 14px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.04);
    color: inherit;
    font-size: 14px;
    font-family: inherit;
    outline: none;
  }

  .form-input:focus {
    border-color: rgba(93, 228, 199, 0.4);
  }

  .form-row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .form-label {
    font-size: 12px;
    color: #6B7280;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-family: 'Space Mono', monospace;
    min-width: 48px;
  }

  .preset-row {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .preset-btn {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: transparent;
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.12s;
  }

  .preset-btn:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .preset-btn--active {
    border-color: #5DE4C7;
    background: rgba(93, 228, 199, 0.12);
  }

  .color-btn {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    transition: all 0.12s;
  }

  .color-btn--active {
    border-color: #E6E1D6;
    transform: scale(1.15);
  }

  .save-btn {
    padding: 10px 20px;
    border-radius: 8px;
    border: none;
    background: #5DE4C7;
    color: #0D1117;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    justify-self: start;
  }

  /* Habit grid */
  .habit-grid {
    display: grid;
    gap: 12px;
  }

  .habit-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    padding: 18px 20px;
    border-left: 3px solid var(--accent, #5DE4C7);
  }

  .habit-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 14px;
  }

  .habit-identity {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .habit-icon {
    font-size: 24px;
  }

  .habit-name {
    font-weight: 600;
    font-size: 15px;
  }

  .habit-streak {
    font-family: 'Space Mono', monospace;
    font-size: 11px;
    color: var(--accent, #5DE4C7);
    margin-top: 2px;
  }

  .archive-btn {
    background: none;
    border: none;
    color: #6B7280;
    font-size: 18px;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
    line-height: 1;
    transition: color 0.15s;
  }

  .archive-btn:hover {
    color: #E06C75;
  }

  /* 7-day grid */
  .week-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 6px;
  }

  .day-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 8px 4px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.02);
    cursor: pointer;
    transition: all 0.15s;
    position: relative;
  }

  .day-cell:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .day-cell--today {
    border-color: rgba(255, 255, 255, 0.15);
  }

  .day-cell--done {
    background: color-mix(in srgb, var(--accent, #5DE4C7) 15%, transparent);
    border-color: color-mix(in srgb, var(--accent, #5DE4C7) 30%, transparent);
  }

  .day-label {
    font-size: 10px;
    color: #6B7280;
    text-transform: uppercase;
    font-family: 'Space Mono', monospace;
  }

  .day-num {
    font-size: 13px;
    font-weight: 600;
    font-family: 'Space Mono', monospace;
  }

  .day-check {
    color: var(--accent, #5DE4C7);
    font-size: 12px;
    font-weight: 700;
  }

  /* Loading */
  .loading {
    text-align: center;
    color: #6B7280;
    padding: 40px 0;
    font-style: italic;
  }

  /* Empty */
  .empty {
    text-align: center;
    padding: 60px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .empty-icon {
    font-size: 40px;
    margin: 0 0 8px;
    color: #6B7280;
  }

  .empty-title {
    font-size: 18px;
    font-weight: 600;
    margin: 0;
    color: #E6E1D6;
  }

  .empty-desc {
    font-size: 14px;
    color: #6B7280;
    max-width: 300px;
    margin: 0;
    line-height: 1.5;
  }

  /* Footer */
  footer {
    display: flex;
    justify-content: center;
    gap: 8px;
    margin-top: 48px;
    padding-top: 20px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    font-size: 12px;
    color: #6B7280;
  }

  footer strong {
    color: #E6E1D6;
  }

  .dot {
    opacity: 0.5;
  }
</style>
