import type {
  ProjectStatus,
  TargetStatus,
  TaskStatus,
  Priority,
  RequirementStatus,
  StatusConfig,
} from "./types";

export const PROJECT_STATUSES: ProjectStatus[] = [
  "planning",
  "active",
  "on-hold",
  "completed",
  "cancelled",
];

export const TARGET_STATUSES: TargetStatus[] = [
  "planning",
  "in-progress",
  "blocked",
  "done",
  "cancelled",
];

export const TASK_STATUSES: TaskStatus[] = [
  "todo",
  "in-progress",
  "blocked",
  "done",
  "cancelled",
];

export const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];

export const REQUIREMENT_STATUSES: RequirementStatus[] = [
  "pool",
  "triaged",
  "held",
];

/** Default status configuration — matches the built-in enums above. */
export const DEFAULT_STATUS_CONFIG: StatusConfig = {
  project: [...PROJECT_STATUSES],
  target: [...TARGET_STATUSES],
  task: [...TASK_STATUSES],
};

/**
 * Resolve the effective status list for a solution, falling back to defaults
 * when the user hasn't customised statuses (or stored an empty list).
 */
export function effectiveStatuses(cfg: StatusConfig | undefined, kind: "project" | "target" | "task"): string[] {
  const list = cfg?.[kind];
  return list && list.length ? list : DEFAULT_STATUS_CONFIG[kind];
}

// Apple-ish palette: muted, with a single accent. Status colors are soft.
export const STATUS_COLORS: Record<string, string> = {
  planning: "#8E8E93",
  active: "#007AFF",
  "in-progress": "#007AFF",
  "on-hold": "#FF9F0A",
  blocked: "#FF3B30",
  todo: "#8E8E93",
  done: "#34C759",
  completed: "#34C759",
  cancelled: "#8E8E93",
  pool: "#007AFF",
  triaged: "#34C759",
  held: "#FF9F0A",
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  low: "#8E8E93",
  medium: "#007AFF",
  high: "#FF9F0A",
  urgent: "#FF3B30",
};

export const PROJECT_PALETTE = [
  "#007AFF",
  "#AF52DE",
  "#FF2D55",
  "#FF9F0A",
  "#34C759",
  "#5AC8FA",
  "#BF5AF2",
  "#FFD60A",
];

export function statusLabel(s: string): string {
  if (s === "on-hold") return "On hold";
  if (s === "in-progress") return "In progress";
  if (s === "todo") return "To do";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function priorityLabel(p: Priority): string {
  return p.charAt(0).toUpperCase() + p.slice(1);
}
