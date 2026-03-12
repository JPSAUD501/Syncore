"use client";

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent
} from "react";
import { skip, useAction, useMutation, useQuery } from "syncorejs/react";
import { api } from "../syncore/_generated/api";

const SECTIONS = [
  { key: "today", label: "Today" },
  { key: "inbox", label: "Inbox" },
  { key: "upcoming", label: "Upcoming" },
  { key: "done", label: "Done" }
] as const;

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" }
] as const;

const ARTIFACT_KINDS = [
  { key: "task_snapshot", label: "Snapshot" },
  { key: "daily_brief", label: "Daily brief" }
] as const;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

type PlannerWindow = Window & {
  __syncorePlannerReady?: boolean;
};

function formatRelative(timestamp?: number): string {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(timestamp);
}

function toDateTimeInputValue(timestamp?: number): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const offset = date.getTimezoneOffset();
  const normalized = new Date(date.getTime() - offset * 60 * 1000);
  return normalized.toISOString().slice(0, 16);
}

function fromDateTimeInputValue(value: string): number | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  const timestamp = parsed.getTime();
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

export function PlannerScreen() {
  const [activeSection, setActiveSection] =
    useState<(typeof SECTIONS)[number]["key"]>("today");
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [quickTitle, setQuickTitle] = useState("");
  const [projectName, setProjectName] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [isOnline, setIsOnline] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [previewArtifactId, setPreviewArtifactId] = useState<string | null>(null);
  const [isGeneratingKind, setIsGeneratingKind] = useState<string | null>(null);
  const [isRailOpen, setIsRailOpen] = useState(false);
  const [confirmDeleteTaskId, setConfirmDeleteTaskId] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState("");
  const [isAddingProject, setIsAddingProject] = useState(false);

  const deferredSearchQuery = useDeferredValue(searchQuery.trim());
  const didAutoSeed = useRef(false);
  const quickAddRef = useRef<HTMLInputElement>(null);

  const workspace = useQuery(api.tasks.workspace, {
    projectId: activeProjectId ?? undefined
  });
  const projects = useQuery(api.projects.list) ?? [];
  const rawSearchResults = useQuery(
    api.tasks.search,
    deferredSearchQuery
      ? { query: deferredSearchQuery, projectId: activeProjectId ?? undefined }
      : skip
  );
  const searchResults = useMemo(() => rawSearchResults ?? [], [rawSearchResults]);
  const task =
    useQuery(api.tasks.get, selectedTaskId ? { id: selectedTaskId } : skip) ?? null;
  const artifacts =
    useQuery(
      api.artifacts.listByTask,
      selectedTaskId ? { taskId: selectedTaskId } : skip
    ) ?? [];
  const artifactPreview =
    useQuery(
      api.artifacts.getContent,
      previewArtifactId ? { id: previewArtifactId } : skip
    ) ?? null;

  const seedDemo = useMutation(api.tasks.seedDemo);
  const createTask = useMutation(api.tasks.create);
  const updateTask = useMutation(api.tasks.update);
  const moveTask = useMutation(api.tasks.move);
  const completeTask = useMutation(api.tasks.complete);
  const reopenTask = useMutation(api.tasks.reopen);
  const scheduleReminder = useMutation(api.tasks.scheduleReminder);
  const deleteTask = useMutation(api.tasks.remove);
  const createProject = useMutation(api.projects.create);
  const updateProject = useMutation(api.projects.update);
  const archiveProject = useMutation(api.projects.archive);
  const removeArtifact = useMutation(api.artifacts.remove);
  const generateArtifact = useAction(api.artifacts.generate);

  const [draftTitle, setDraftTitle] = useState("");
  const [draftDetails, setDraftDetails] = useState("");
  const [draftPriority, setDraftPriority] = useState("medium");
  const [draftProjectId, setDraftProjectId] = useState("");
  const [draftDueAt, setDraftDueAt] = useState("");
  const [draftReminderAt, setDraftReminderAt] = useState("");

  const visibleTasks = useMemo(
    () =>
      deferredSearchQuery
        ? searchResults
        : (workspace?.sections[activeSection] ?? []),
    [activeSection, deferredSearchQuery, searchResults, workspace]
  );
  const totalTasks = workspace?.totals.all ?? 0;
  const activeProject = projects.find((p) => p._id === activeProjectId) ?? null;
  const activeSectionLabel =
    SECTIONS.find((s) => s.key === activeSection)?.label ?? "Today";
  const headingTitle = deferredSearchQuery
    ? `"${deferredSearchQuery}"`
    : activeProject?.name ?? activeSectionLabel;
  const headingMeta = deferredSearchQuery
    ? `${visibleTasks.length} result${visibleTasks.length !== 1 ? "s" : ""}`
    : activeProject
      ? `${visibleTasks.length} task${visibleTasks.length !== 1 ? "s" : ""}`
      : `${workspace?.totals[activeSection] ?? 0} task${(workspace?.totals[activeSection] ?? 0) !== 1 ? "s" : ""}`;

  // Auto-seed demo workspace on first load if empty
  useEffect(() => {
    if (workspace && totalTasks === 0 && !didAutoSeed.current) {
      didAutoSeed.current = true;
      void seedDemo({});
    }
  }, [workspace, totalTasks, seedDemo]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as PlannerWindow).__syncorePlannerReady = workspace !== undefined;
    }
  }, [workspace]);

  useEffect(() => {
    if (typeof navigator !== "undefined") setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
    };
  }, []);

  useEffect(() => {
    if (!task) {
      setDraftTitle("");
      setDraftDetails("");
      setDraftPriority("medium");
      setDraftProjectId("");
      setDraftDueAt("");
      setDraftReminderAt("");
      setPreviewArtifactId(null);
      setConfirmDeleteTaskId(null);
      return;
    }
    setDraftTitle(task.title);
    setDraftDetails(task.details);
    setDraftPriority(task.priority);
    setDraftProjectId(task.projectId ?? "");
    setDraftDueAt(toDateTimeInputValue(task.dueAt));
    setDraftReminderAt(toDateTimeInputValue(task.reminderAt));
    setSaveState("saved");
    setConfirmDeleteTaskId(null);
  }, [task]);

  useEffect(() => {
    if (visibleTasks.length === 0) { setSelectedTaskId(null); return; }
    if (selectedTaskId && !visibleTasks.some((e) => e._id === selectedTaskId)) {
      setSelectedTaskId(null);
    }
  }, [selectedTaskId, visibleTasks]);

  // ── Handlers ──────────────────────────────────────────────

  function handleSelectSection(sectionKey: (typeof SECTIONS)[number]["key"]) {
    setSearchQuery("");
    setActiveSection(sectionKey);
    setIsRailOpen(false);
  }

  function handleToggleProject(projectId: string | null) {
    setActiveProjectId((current) => (current === projectId ? null : projectId));
    setIsRailOpen(false);
  }

  function handleSelectTask(taskId: string | null) {
    setSelectedTaskId(taskId);
  }

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quickTitle.trim()) return;

    const nextStatus =
      activeSection === "done" || deferredSearchQuery ? "inbox" : activeSection;
    const id = await createTask({
      title: quickTitle.trim(),
      details: undefined,
      status: nextStatus,
      priority: nextStatus === "today" ? "high" : "medium",
      projectId: activeProjectId ?? undefined,
      dueAt: undefined,
      reminderAt: undefined
    });
    setQuickTitle("");
    setSelectedTaskId(id);
    setActiveSection(nextStatus);
    // Return focus to input for rapid entry
    quickAddRef.current?.focus();
  }

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectName.trim()) return;
    const id = await createProject({ name: projectName.trim(), color: undefined });
    setProjectName("");
    setIsAddingProject(false);
    setActiveProjectId(id);
  }

  function handleStartEditProject(projectId: string, currentName: string) {
    setEditingProjectId(projectId);
    setEditingProjectName(currentName);
  }

  async function handleSaveProjectName(projectId: string) {
    if (!editingProjectName.trim()) { setEditingProjectId(null); return; }
    const project = projects.find((p) => p._id === projectId);
    if (!project) { setEditingProjectId(null); return; }
    await updateProject({
      id: projectId,
      name: editingProjectName.trim(),
      color: project.color
    });
    setEditingProjectId(null);
  }

  function handleProjectNameKeyDown(event: KeyboardEvent, projectId: string) {
    if (event.key === "Enter") { event.preventDefault(); void handleSaveProjectName(projectId); }
    if (event.key === "Escape") setEditingProjectId(null);
  }

  async function handleArchiveProject(projectId: string) {
    if (activeProjectId === projectId) setActiveProjectId(null);
    await archiveProject({ id: projectId });
  }

  async function handleSaveTask() {
    if (!task) return;
    const nextTitle = draftTitle.trim() || task.title;
    const nextDetails = draftDetails.trim();
    const nextProjectId = draftProjectId || undefined;
    const nextDueAt = fromDateTimeInputValue(draftDueAt);
    const nextReminderAt = fromDateTimeInputValue(draftReminderAt);

    const contentChanged =
      nextTitle !== task.title ||
      nextDetails !== task.details ||
      draftPriority !== task.priority ||
      nextProjectId !== task.projectId ||
      nextDueAt !== task.dueAt;
    const reminderChanged = nextReminderAt !== task.reminderAt;

    if (!contentChanged && !reminderChanged) { setSaveState("saved"); return; }

    setSaveState("saving");
    if (contentChanged) {
      await updateTask({
        id: task._id,
        title: nextTitle,
        details: nextDetails,
        priority: draftPriority,
        projectId: nextProjectId,
        dueAt: nextDueAt
      });
    }
    if (reminderChanged) {
      await scheduleReminder({ id: task._id, reminderAt: nextReminderAt });
    }
    setSaveState("saved");
  }

  async function handleMoveTask(status: (typeof SECTIONS)[number]["key"]) {
    if (!task) return;
    await moveTask({ id: task._id, status });
    setActiveSection(status);
  }

  async function handleCompleteTask() {
    if (!task) return;
    await completeTask({ id: task._id });
    setActiveSection("done");
  }

  async function handleReopenTask() {
    if (!task) return;
    await reopenTask({ id: task._id, status: "today" });
    setActiveSection("today");
  }

  async function handleDeleteTask() {
    if (!task) return;
    if (confirmDeleteTaskId !== task._id) {
      setConfirmDeleteTaskId(task._id);
      return;
    }
    const nextTaskId = visibleTasks.find((e) => e._id !== task._id)?._id ?? null;
    await deleteTask({ id: task._id });
    setSelectedTaskId(nextTaskId);
    setConfirmDeleteTaskId(null);
  }

  async function handleGenerateArtifact(kind: string) {
    if (!task) return;
    setIsGeneratingKind(kind);
    const result = await generateArtifact({ taskId: task._id, kind });
    setPreviewArtifactId(result.artifactId);
    setIsGeneratingKind(null);
  }

  async function handleRemoveArtifact(id: string) {
    await removeArtifact({ id });
    if (previewArtifactId === id) setPreviewArtifactId(null);
  }

  async function handleInstall() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
    setIsRailOpen(false);
  }

  // ── Other sections to move to (not current, not done when already there) ──
  const moveSections = SECTIONS.filter(
    (s) => s.key !== task?.status && s.key !== "done"
  );

  return (
    <main className="planner-app">
      <div className={`planner-shell ${task ? "planner-shell--detail-open" : "planner-shell--detail-closed"}`}>
        <button
          aria-hidden={!isRailOpen}
          className={`planner-overlay ${isRailOpen ? "planner-overlay--visible" : ""}`}
          onClick={() => setIsRailOpen(false)}
          tabIndex={isRailOpen ? 0 : -1}
          type="button"
        />

        {/* ── Sidebar ── */}
        <aside className={`planner-rail ${isRailOpen ? "planner-rail--open" : ""}`}>
          <div className="planner-rail__header">
            <span className="planner-mark">Syncore planner</span>
            <button className="icon-button rail-close" onClick={() => setIsRailOpen(false)} type="button">✕</button>
          </div>

          <div className="planner-intro">
            <h1>Your workspace</h1>
            <p>{isOnline ? "Stored locally on this device." : "Offline — everything still works."}</p>
          </div>

          <nav aria-label="Sections" className="section-list">
            {SECTIONS.map((section) => (
              <button
                key={section.key}
                className={`section-link ${activeSection === section.key && !deferredSearchQuery ? "section-link--active" : ""}`}
                onClick={() => handleSelectSection(section.key)}
                type="button"
              >
                <span>{section.label}</span>
                <span className="section-count">{workspace?.totals[section.key] ?? 0}</span>
              </button>
            ))}
          </nav>

          {/* ── Projects ── */}
          <div className="rail-block">
            <div className="rail-heading">
              <span>Projects</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {activeProjectId ? (
                  <button className="text-button" onClick={() => handleToggleProject(null)} type="button">Clear</button>
                ) : null}
                <button
                  className="text-button text-button--icon"
                  onClick={() => setIsAddingProject((v) => !v)}
                  title="New project"
                  type="button"
                >
                  {isAddingProject ? "✕" : "+"}
                </button>
              </div>
            </div>

            {isAddingProject ? (
              <form className="inline-form" onSubmit={(event) => void handleCreateProject(event)}>
                <div className="inline-form__row">
                  <input
                    autoFocus
                    className="field-input"
                    id="project-name"
                    onChange={(event) => setProjectName(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Escape") { setIsAddingProject(false); setProjectName(""); } }}
                    placeholder="Project name"
                    value={projectName}
                  />
                  <button className="button button--primary" type="submit">Add</button>
                </div>
              </form>
            ) : null}

            <div className="project-list">
              {projects.map((project) => (
                <div
                  key={project._id}
                  className={`project-list-item ${activeProjectId === project._id ? "project-list-item--active" : ""}`}
                >
                  {editingProjectId === project._id ? (
                    <input
                      autoFocus
                      className="field-input project-name-input"
                      onBlur={() => void handleSaveProjectName(project._id)}
                      onChange={(event) => setEditingProjectName(event.target.value)}
                      onKeyDown={(event) => handleProjectNameKeyDown(event, project._id)}
                      value={editingProjectName}
                    />
                  ) : (
                    <button
                      className="project-link"
                      onClick={() => handleToggleProject(project._id)}
                      type="button"
                    >
                      <span
                        className="project-swatch"
                        style={{ backgroundColor: project.color }}
                      />
                      <span className="project-link__label">{project.name}</span>
                    </button>
                  )}
                  <div className="project-actions">
                    <button
                      className="text-button text-button--icon"
                      onClick={() => handleStartEditProject(project._id, project.name)}
                      title="Rename"
                      type="button"
                    >
                      ✎
                    </button>
                    <button
                      className="text-button text-button--icon text-button--danger"
                      onClick={() => void handleArchiveProject(project._id)}
                      title="Archive project"
                      type="button"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
              {projects.length === 0 && !isAddingProject ? (
                <p className="rail-empty">No projects yet. Click + to create one.</p>
              ) : null}
            </div>
          </div>

          {installPrompt ? (
            <div style={{ marginTop: "auto" }}>
              <button className="button button--quiet" onClick={() => void handleInstall()} style={{ width: "100%" }} type="button">
                Install app
              </button>
            </div>
          ) : null}
        </aside>

        {/* ── Main content ── */}
        <section className="planner-main">
          <div className="planner-main__header">
            <header className="planner-topbar">
              <div className="planner-topbar__left">
                <button className="icon-button rail-toggle" onClick={() => setIsRailOpen(true)} type="button">☰</button>
                <div>
                  <h2>{headingTitle}</h2>
                  <p className="planner-summary">{headingMeta}</p>
                </div>
              </div>
              <div className="planner-topbar__right">
                <div className="status-line">
                  <span className={`status-indicator ${isOnline ? "" : "status-indicator--offline"}`} />
                  <span>{isOnline ? "Local" : "Offline"}</span>
                </div>
              </div>
            </header>

            <div className="workspace-tools">
              <div className="tool-row">
                <div className="search-panel">
                  <label className="field-label" htmlFor="task-search">Search</label>
                  <div className="search-input-wrap">
                    <input
                      className="field-input"
                      id="task-search"
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search tasks…"
                      value={searchQuery}
                    />
                    {searchQuery ? (
                      <button
                        className="search-clear"
                        onClick={() => setSearchQuery("")}
                        title="Clear search"
                        type="button"
                      >
                        ✕
                      </button>
                    ) : null}
                  </div>
                </div>

                <form className="quick-add" onSubmit={(event) => void handleCreateTask(event)}>
                  <label className="field-label" htmlFor="quick-task">New task</label>
                  <div className="quick-add__row">
                    <input
                      ref={quickAddRef}
                      className="quick-add__input"
                      id="quick-task"
                      onChange={(event) => setQuickTitle(event.target.value)}
                      placeholder="What needs to be done?"
                      value={quickTitle}
                    />
                    <button
                      aria-label="Add task"
                      className="button button--primary"
                      disabled={!quickTitle.trim()}
                      type="submit"
                    >
                      +
                    </button>
                  </div>
                </form>
              </div>

              <div className="section-tabs" role="tablist" aria-label="Task sections">
                {SECTIONS.map((section) => (
                  <button
                    key={section.key}
                    className={`tab-button ${activeSection === section.key && !deferredSearchQuery ? "tab-button--active" : ""}`}
                    onClick={() => handleSelectSection(section.key)}
                    role="tab"
                    type="button"
                  >
                    <span>{section.label}</span>
                    <span className="mono-text">{workspace?.totals[section.key] ?? 0}</span>
                  </button>
                ))}
              </div>

              {projects.length > 0 ? (
                <div className="project-strip" aria-label="Project filters">
                  <button
                    className={`project-chip ${activeProjectId === null ? "project-chip--active" : ""}`}
                    onClick={() => handleToggleProject(null)}
                    type="button"
                  >
                    All
                  </button>
                  {projects.map((project) => (
                    <button
                      key={project._id}
                      className={`project-chip ${activeProjectId === project._id ? "project-chip--active" : ""}`}
                      onClick={() => handleToggleProject(project._id)}
                      type="button"
                    >
                      <span className="project-swatch" style={{ backgroundColor: project.color }} />
                      <span>{project.name}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="planner-main__body">
            {visibleTasks.length === 0 ? (
              <div className="empty-state empty-state--quiet">
                <h3>No tasks here</h3>
                <p>Add a task above or switch to another section.</p>
              </div>
            ) : (
              <>
                <div className="list-meta">
                  <span>{visibleTasks.length} task{visibleTasks.length !== 1 ? "s" : ""}</span>
                  <span>{activeProject ? activeProject.name : "All projects"}</span>
                </div>

                <div className="task-list" role="list">
                  {visibleTasks.map((entry) => (
                    <button
                      key={entry._id}
                      className={`task-row task-row--priority-${entry.priority} ${selectedTaskId === entry._id ? "task-row--active" : ""}`}
                      onClick={() => handleSelectTask(entry._id)}
                      role="listitem"
                      type="button"
                    >
                      <div className="task-row__indicator" />
                      <div className="task-row__body">
                        <div className="task-row__top">
                          <span className="task-row__title">{entry.title}</span>
                          <span className="task-row__time">
                            {formatRelative(entry.reminderAt ?? entry.dueAt ?? entry.updatedAt)}
                          </span>
                        </div>
                        {entry.details ? (
                          <span className="task-row__detail">{entry.details}</span>
                        ) : null}
                        <div className="task-row__footer">
                          <span>{entry.projectName ?? "—"}</span>
                          <span>{entry.status}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        {/* ── Detail panel ── */}
        {task ? (
          <aside className="planner-detail planner-detail--open">
            <div className="detail-header">
              <div className="detail-title">
                <div className="detail-meta">
                  <span className={`priority priority--${task.priority}`}>{task.priority}</span>
                  {task.projectName ? (
                    <span className="detail-meta__item">{task.projectName}</span>
                  ) : null}
                  <span className="detail-meta__item">{task.status}</span>
                </div>
                <h3>{task.title}</h3>
                {(task.dueAt || task.reminderAt) ? (
                  <p className="planner-summary">
                    {task.dueAt ? `Due ${formatRelative(task.dueAt)}` : ""}
                    {task.dueAt && task.reminderAt ? " · " : ""}
                    {task.reminderAt ? `Reminder ${formatRelative(task.reminderAt)}` : ""}
                  </p>
                ) : null}
              </div>
              <button
                className="icon-button detail-close"
                onClick={() => handleSelectTask(null)}
                type="button"
              >
                ✕
              </button>
            </div>

            <div className="detail-body">
              {/* ── Fields ── */}
              <section className="detail-section">
                <div className="detail-grid">
                  <div>
                    <label className="field-label" htmlFor="task-title">Title</label>
                    <input
                      className="field-input"
                      id="task-title"
                      onChange={(event) => { setDraftTitle(event.target.value); setSaveState("idle"); }}
                      value={draftTitle}
                    />
                  </div>

                  <div>
                    <label className="field-label" htmlFor="task-details">Notes</label>
                    <textarea
                      className="field-textarea"
                      id="task-details"
                      onChange={(event) => { setDraftDetails(event.target.value); setSaveState("idle"); }}
                      rows={6}
                      value={draftDetails}
                    />
                  </div>

                  <div className="detail-columns">
                    <div>
                      <label className="field-label" htmlFor="task-priority">Priority</label>
                      <select
                        className="field-input"
                        id="task-priority"
                        onChange={(event) => { setDraftPriority(event.target.value); setSaveState("idle"); }}
                        value={draftPriority}
                      >
                        {PRIORITIES.map((p) => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="field-label" htmlFor="task-project">Project</label>
                      <select
                        className="field-input"
                        id="task-project"
                        onChange={(event) => { setDraftProjectId(event.target.value); setSaveState("idle"); }}
                        value={draftProjectId}
                      >
                        <option value="">None</option>
                        {projects.map((p) => (
                          <option key={p._id} value={p._id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="detail-columns">
                    <div>
                      <label className="field-label" htmlFor="task-dueAt">Due date</label>
                      <input
                        className="field-input"
                        id="task-dueAt"
                        onChange={(event) => { setDraftDueAt(event.target.value); setSaveState("idle"); }}
                        type="datetime-local"
                        value={draftDueAt}
                      />
                    </div>

                    <div>
                      <label className="field-label" htmlFor="task-reminderAt">Reminder</label>
                      <input
                        className="field-input"
                        id="task-reminderAt"
                        onChange={(event) => { setDraftReminderAt(event.target.value); setSaveState("idle"); }}
                        type="datetime-local"
                        value={draftReminderAt}
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* ── Save + Move ── */}
              <section className="detail-section">
                <div className="detail-actions">
                  <button
                    className="button button--primary"
                    disabled={saveState === "saving"}
                    onClick={() => void handleSaveTask()}
                    type="button"
                  >
                    {saveState === "saving" ? "Saving…" : "Save"}
                  </button>
                  <span className={`detail-status ${saveState === "idle" ? "detail-status--idle" : ""}`}>
                    {saveState === "saved" ? "Saved" : saveState === "saving" ? "Saving…" : "Unsaved changes"}
                  </span>
                </div>

                <div className="detail-divider" />

                <div className="detail-row-label">Move to</div>
                <div className="move-group">
                  {moveSections.map((section) => (
                    <button
                      key={section.key}
                      className="button button--quiet"
                      onClick={() => void handleMoveTask(section.key)}
                      type="button"
                    >
                      {section.label}
                    </button>
                  ))}
                  {task.status === "done" ? (
                    <button className="button button--quiet" onClick={() => void handleReopenTask()} type="button">
                      Reopen
                    </button>
                  ) : (
                    <button className="button button--quiet" onClick={() => void handleCompleteTask()} type="button">
                      ✓ Mark done
                    </button>
                  )}
                </div>

                <div className="detail-divider" />

                {confirmDeleteTaskId === task._id ? (
                  <div className="delete-confirm">
                    <span className="detail-status">Delete this task? This cannot be undone.</span>
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <button className="button button--danger" onClick={() => void handleDeleteTask()} type="button">
                        Yes, delete
                      </button>
                      <button className="button button--quiet" onClick={() => setConfirmDeleteTaskId(null)} type="button">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button className="button button--danger" onClick={() => void handleDeleteTask()} type="button">
                    Delete task
                  </button>
                )}
              </section>

              {/* ── Artifacts ── */}
              <section className="detail-section">
                <div className="rail-heading" style={{ marginBottom: 10 }}>
                  <span>Artifacts</span>
                  <span className="mono-text">{artifacts.length}</span>
                </div>

                <div className="artifact-actions">
                  {ARTIFACT_KINDS.map((artifact) => (
                    <button
                      key={artifact.key}
                      className="button button--quiet"
                      disabled={isGeneratingKind !== null}
                      onClick={() => void handleGenerateArtifact(artifact.key)}
                      type="button"
                    >
                      {isGeneratingKind === artifact.key ? "Generating…" : `+ ${artifact.label}`}
                    </button>
                  ))}
                </div>

                {artifacts.length > 0 ? (
                  <div className="artifact-list">
                    {artifacts.map((artifact) => (
                      <div key={artifact._id} className="artifact-row">
                        <button
                          className={`artifact-link ${previewArtifactId === artifact._id ? "artifact-link--active" : ""}`}
                          onClick={() =>
                            setPreviewArtifactId(
                              previewArtifactId === artifact._id ? null : artifact._id
                            )
                          }
                          type="button"
                        >
                          <strong>{artifact.title}</strong>
                          <span>{artifact.kind.replace("_", " ")} · {artifact.size}b</span>
                        </button>
                        <button
                          className="text-button text-button--icon text-button--danger"
                          onClick={() => void handleRemoveArtifact(artifact._id)}
                          title="Remove artifact"
                          type="button"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rail-empty" style={{ marginTop: 8 }}>No artifacts yet. Generate one above.</p>
                )}

                {artifactPreview ? (
                  <div className="artifact-preview">
                    <div className="rail-heading">
                      <span>{artifactPreview.title}</span>
                      <button
                        className="text-button"
                        onClick={() => setPreviewArtifactId(null)}
                        type="button"
                      >
                        Close
                      </button>
                    </div>
                    <pre>{artifactPreview.content}</pre>
                  </div>
                ) : null}
              </section>
            </div>
          </aside>
        ) : null}
      </div>
    </main>
  );
}
