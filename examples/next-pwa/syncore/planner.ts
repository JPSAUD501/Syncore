export const TASK_STATUSES = [
  "inbox",
  "today",
  "upcoming",
  "done"
] as const;

export const TASK_PRIORITIES = ["low", "medium", "high"] as const;

export const PROJECT_COLORS = [
  "#8D5A3B",
  "#466067",
  "#5E6B3F",
  "#7D4E57",
  "#A47C48"
] as const;

export const DEMO_PROJECTS = [
  { name: "Spring release", color: "#8D5A3B" },
  { name: "Research backlog", color: "#466067" },
  { name: "Personal admin", color: "#5E6B3F" }
] as const;

export function buildTaskSearchText(input: {
  title: string;
  details: string;
  projectName: string | null | undefined;
  priority: string;
  status: string;
}): string {
  return [
    input.title,
    input.details,
    input.projectName ?? "",
    input.priority,
    input.status
  ]
    .join(" ")
    .trim()
    .toLowerCase();
}

export function slugifyProjectName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function formatPlannerDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}
