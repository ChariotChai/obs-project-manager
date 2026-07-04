// Core domain model for the Project Manager plugin.
//
// Hierarchy: Solution (root) -> Project -> Target -> Task
// Plus: each Solution has a Requirement pool.
//
// Each entity is persisted as a Markdown file with YAML frontmatter so that it
// remains fully editable inside Obsidian. The `kind` frontmatter field tells the
// plugin how to parse a file.

export type EntityKind =
  | "solution"
  | "project"
  | "target"
  | "task"
  | "requirement";

export type ProjectStatus =
  | "planning"
  | "active"
  | "on-hold"
  | "completed"
  | "cancelled";

export type TargetStatus =
  | "planning"
  | "in-progress"
  | "blocked"
  | "done"
  | "cancelled";

export type TaskStatus =
  | "todo"
  | "in-progress"
  | "blocked"
  | "done"
  | "cancelled";

export type Priority = "low" | "medium" | "high" | "urgent";

export type RequirementStatus = "pool" | "triaged" | "held";

/** A Jira reference kept lightweight: the issue key + a display title. */
export interface JiraRef {
  key: string; // e.g. "ENG-123"
  title?: string;
  url?: string;
}

export interface BaseEntity {
  id: string;
  kind: EntityKind;
  /** Vault-relative path to the markdown file. */
  path: string;
  /** Display name. Optional for requirements (which use `title`). */
  name?: string;
  createdAt: number;
  updatedAt: number;
  description?: string;
}

export interface Solution extends BaseEntity {
  kind: "solution";
}

export interface Project extends BaseEntity {
  kind: "project";
  solutionId: string;
  owner?: string;
  startDate?: string; // ISO date YYYY-MM-DD
  endDate?: string;
  status: ProjectStatus;
  jiraEpics: JiraRef[];
  /** Free-form member names participating in the project. */
  members: string[];
  color?: string;
}

export interface Target extends BaseEntity {
  kind: "target";
  projectId: string;
  solutionId: string;
  owner?: string;
  startDate?: string;
  endDate?: string;
  status: TargetStatus;
  /** Ids of other targets (same project) this target depends on. */
  dependencies: string[];
  color?: string;
}

export interface Task extends BaseEntity {
  kind: "task";
  targetId: string;
  projectId: string;
  solutionId: string;
  owner?: string;
  status: TaskStatus;
  startDate?: string;
  dueDate?: string;
  priority: Priority;
  jiraStories: JiraRef[];
  /** Estimated effort in story points (optional). */
  estimate?: number;
}

export interface Requirement extends BaseEntity {
  kind: "requirement";
  solutionId: string;
  title: string;
  source?: string; // who raised it
  status: RequirementStatus;
  /** When triaged, the project it was assigned to. */
  assignedProjectId?: string;
  priority: Priority;
  triagedAt?: number;
  tags: string[];
}

export type AnyEntity = Solution | Project | Target | Task | Requirement;

export interface VaultModel {
  solution: Solution;
  projects: Project[];
  targets: Target[];
  tasks: Task[];
  requirements: Requirement[];
}

// ---- Settings ----

export interface PmSettings {
  /** Vault-relative folder that contains one sub-folder per solution. */
  solutionsFolder: string;
  /** Optional Jira base URL, used to render clickable links. */
  jiraBaseUrl: string;
}

export const DEFAULT_SETTINGS: PmSettings = {
  solutionsFolder: "Solutions",
  jiraBaseUrl: "",
};
