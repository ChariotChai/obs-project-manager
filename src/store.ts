import { writable, get } from "svelte/store";
import type { App, TFile } from "obsidian";
import { Events } from "obsidian";
import type {
  PmSettings,
  Solution,
  Project,
  Target,
  Task,
  Requirement,
  VaultModel,
  AnyEntity,
  ProjectStatus,
  TargetStatus,
  TaskStatus,
  Priority,
} from "./types";
import { Persistence } from "./persistence";

export type SelectionKind = "solution" | "project" | "target" | "task" | "requirement" | null;
export interface Selection {
  kind: SelectionKind;
  id: string | null;
}

export type ViewTab = "overview" | "timeline" | "board" | "requirements";

export type EditorKind = "solution" | "project" | "target" | "task" | "requirement";
export interface EditorState {
  mode: "create" | "edit";
  kind: EditorKind;
  entity?: AnyEntity | null;
  projectId?: string;
  targetId?: string;
}

const EMPTY_MODEL: VaultModel = {
  solution: { id: "", kind: "solution", path: "", name: "", createdAt: 0, updatedAt: 0 },
  projects: [],
  targets: [],
  tasks: [],
  requirements: [],
};

export class PmStore extends Events {
  model = writable<VaultModel>(EMPTY_MODEL);
  selection = writable<Selection>({ kind: null, id: null });
  tab = writable<ViewTab>("overview");
  loading = writable<boolean>(false);
  error = writable<string | null>(null);
  editor = writable<EditorState | null>(null);

  /** The active solution slug (folder name). */
  activeSlug = writable<string>("");
  /** All discovered solution folders. */
  solutions = writable<{ slug: string; path: string; name: string }[]>([]);

  private persistence: Persistence;
  private app: App;
  private settings: PmSettings;
  private reloadTimer: number | null = null;

  constructor(app: App, settings: PmSettings) {
    super();
    this.app = app;
    this.settings = settings;
    this.persistence = new Persistence(app, settings);
  }

  setSettings(settings: PmSettings) {
    this.settings = settings;
    this.persistence.updateSettings(settings);
  }

  getPersistence() {
    return this.persistence;
  }

  // ---- Discovery / loading ----

  /** Scan for solution folders and pick the active one. */
  async refreshSolutions(): Promise<void> {
    const found = this.persistence.listSolutions().map((s) => {
      const solFile = this.app.vault.getAbstractFileByPath(s.path + "/solution.md") as TFile | undefined;
      let name = s.slug;
      if (solFile) {
        const cache = this.app.metadataCache.getFileCache(solFile);
        if (cache?.frontmatter?.name) name = String(cache.frontmatter.name);
      }
      return { slug: s.slug, path: s.path, name };
    });
    this.solutions.set(found);

    let slug = get(this.activeSlug);
    if (!slug || !found.some((s) => s.slug === slug)) {
      slug = found[0]?.slug ?? "";
      this.activeSlug.set(slug);
    }
    if (slug) await this.reload();
    else this.model.set(EMPTY_MODEL);
  }

  async setActiveSolution(slug: string): Promise<void> {
    this.activeSlug.set(slug);
    await this.reload();
  }

  /** Ensure at least one solution exists; create a default if none. */
  async ensureDefaultSolution(): Promise<void> {
    const found = this.persistence.listSolutions();
    if (found.length > 0) return;
    await this.persistence.ensureSolution("default", "Default Solution");
  }

  async reload(): Promise<void> {
    const slug = get(this.activeSlug);
    if (!slug) {
      this.model.set(EMPTY_MODEL);
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      const m = await this.persistence.loadModel(slug);
      if (m) this.model.set(m);
      else this.model.set(EMPTY_MODEL);
    } catch (e: any) {
      this.error.set(e?.message ?? String(e));
    } finally {
      this.loading.set(false);
    }
  }

  /** Debounced reload triggered by vault events. */
  scheduleReload(): void {
    if (this.reloadTimer !== null) window.clearTimeout(this.reloadTimer);
    this.reloadTimer = window.setTimeout(() => {
      this.reloadTimer = null;
      this.reload();
    }, 250);
  }

  // ---- Selection ----

  select(kind: SelectionKind, id: string | null) {
    this.selection.set({ kind, id });
  }

  setTab(tab: ViewTab) {
    this.tab.set(tab);
  }

  openEditor(state: EditorState) {
    this.editor.set(state);
  }

  closeEditor() {
    this.editor.set(null);
  }

  // ---- CRUD: Projects ----

  async createProject(input: {
    name: string;
    owner?: string;
    startDate?: string;
    endDate?: string;
    status?: ProjectStatus;
    description?: string;
  }): Promise<Project | null> {
    const sol = get(this.model).solution;
    if (!sol.id) return null;
    const project = await this.persistence.createProject({ solution: sol, ...input });
    this.model.update((m) => ({ ...m, projects: [...m.projects, project] }));
    return project;
  }

  async updateProject(id: string, patch: Partial<Project>): Promise<void> {
    const m = get(this.model);
    const project = m.projects.find((p) => p.id === id);
    if (!project) return;
    const next = await this.persistence.updateProject(project, patch);
    this.model.update((mm) => ({
      ...mm,
      projects: mm.projects.map((p) => (p.id === id ? next : p)),
    }));
  }

  async deleteProject(id: string): Promise<void> {
    const m = get(this.model);
    const project = m.projects.find((p) => p.id === id);
    if (!project) return;
    await this.persistence.deleteProject(project);
    this.model.update((mm) => ({
      ...mm,
      projects: mm.projects.filter((p) => p.id !== id),
      targets: mm.targets.filter((t) => t.projectId !== id),
      tasks: mm.tasks.filter((t) => t.projectId !== id),
    }));
    const sel = get(this.selection);
    if (sel.kind === "project" && sel.id === id) this.select(null, null);
  }

  // ---- CRUD: Targets ----

  async createTarget(input: {
    projectId: string;
    name: string;
    owner?: string;
    startDate?: string;
    endDate?: string;
    status?: TargetStatus;
    description?: string;
  }): Promise<Target | null> {
    const m = get(this.model);
    const project = m.projects.find((p) => p.id === input.projectId);
    if (!project) return null;
    const target = await this.persistence.createTarget({
      solution: m.solution,
      project,
      ...input,
    });
    this.model.update((mm) => ({ ...mm, targets: [...mm.targets, target] }));
    return target;
  }

  async updateTarget(id: string, patch: Partial<Target>): Promise<void> {
    const m = get(this.model);
    const target = m.targets.find((t) => t.id === id);
    if (!target) return;
    const next = await this.persistence.updateTarget(target, patch);
    this.model.update((mm) => ({
      ...mm,
      targets: mm.targets.map((t) => (t.id === id ? next : t)),
    }));
  }

  async deleteTarget(id: string): Promise<void> {
    const m = get(this.model);
    const target = m.targets.find((t) => t.id === id);
    if (!target) return;
    await this.persistence.deleteTarget(target);
    this.model.update((mm) => ({
      ...mm,
      targets: mm.targets.filter((t) => t.id !== id),
      tasks: mm.tasks.filter((t) => t.targetId !== id),
    }));
    const sel = get(this.selection);
    if (sel.kind === "target" && sel.id === id) this.select(null, null);
  }

  // ---- CRUD: Tasks ----

  async createTask(input: {
    targetId: string;
    name: string;
    owner?: string;
    status?: TaskStatus;
    dueDate?: string;
    priority?: Priority;
    description?: string;
  }): Promise<Task | null> {
    const m = get(this.model);
    const target = m.targets.find((t) => t.id === input.targetId);
    if (!target) return null;
    const project = m.projects.find((p) => p.id === target.projectId);
    if (!project) return null;
    const task = await this.persistence.createTask({
      solution: m.solution,
      project,
      target,
      ...input,
    });
    this.model.update((mm) => ({ ...mm, tasks: [...mm.tasks, task] }));
    return task;
  }

  async updateTask(id: string, patch: Partial<Task>): Promise<void> {
    const m = get(this.model);
    const task = m.tasks.find((t) => t.id === id);
    if (!task) return;
    const next = await this.persistence.updateTask(task, patch);
    this.model.update((mm) => ({
      ...mm,
      tasks: mm.tasks.map((t) => (t.id === id ? next : t)),
    }));
  }

  async deleteTask(id: string): Promise<void> {
    const m = get(this.model);
    const task = m.tasks.find((t) => t.id === id);
    if (!task) return;
    await this.persistence.deleteTask(task);
    this.model.update((mm) => ({ ...mm, tasks: mm.tasks.filter((t) => t.id !== id) }));
    const sel = get(this.selection);
    if (sel.kind === "task" && sel.id === id) this.select(null, null);
  }

  // ---- CRUD: Requirements ----

  async createRequirement(input: {
    title: string;
    description?: string;
    source?: string;
    priority?: Priority;
  }): Promise<Requirement | null> {
    const sol = get(this.model).solution;
    if (!sol.id) return null;
    const req = await this.persistence.createRequirement({ solution: sol, ...input });
    this.model.update((m) => ({ ...m, requirements: [...m.requirements, req] }));
    return req;
  }

  async updateRequirement(id: string, patch: Partial<Requirement>): Promise<void> {
    const m = get(this.model);
    const req = m.requirements.find((r) => r.id === id);
    if (!req) return;
    const next = await this.persistence.updateRequirement(req, patch);
    this.model.update((mm) => ({
      ...mm,
      requirements: mm.requirements.map((r) => (r.id === id ? next : r)),
    }));
  }

  async deleteRequirement(id: string): Promise<void> {
    const m = get(this.model);
    const req = m.requirements.find((r) => r.id === id);
    if (!req) return;
    await this.persistence.deleteRequirement(req);
    this.model.update((mm) => ({
      ...mm,
      requirements: mm.requirements.filter((r) => r.id !== id),
    }));
    const sel = get(this.selection);
    if (sel.kind === "requirement" && sel.id === id) this.select(null, null);
  }

  /** Triage a requirement into a project (or hold it). */
  async triageRequirement(id: string, projectId: string | undefined, status: "triaged" | "held" = "triaged") {
    await this.updateRequirement(id, {
      assignedProjectId: projectId,
      status,
    });
  }

  async openEntity(kind: SelectionKind, id: string | null): Promise<void> {
    if (!kind || !id) return;
    const m = get(this.model);
    let entity: AnyEntity | undefined;
    if (kind === "project") entity = m.projects.find((p) => p.id === id);
    else if (kind === "target") entity = m.targets.find((t) => t.id === id);
    else if (kind === "task") entity = m.tasks.find((t) => t.id === id);
    else if (kind === "requirement") entity = m.requirements.find((r) => r.id === id);
    else if (kind === "solution") entity = m.solution;
    if (entity) await this.persistence.openFile(entity.path);
  }

  async updateSolution(patch: Partial<Solution>): Promise<void> {
    const m = get(this.model);
    const next = await this.persistence.updateSolution(m.solution, patch);
    this.model.update((mm) => ({ ...mm, solution: next }));
  }
}

// ---- Derived selectors ----

export function selectProjects(model: VaultModel) {
  return [...model.projects].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
}

export interface ProjectNode {
  project: Project;
  targets: { target: Target; tasks: Task[] }[];
}

export function buildTree(model: VaultModel): ProjectNode[] {
  return model.projects
    .slice()
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
    .map((project) => {
      const targets = model.targets
        .filter((t) => t.projectId === project.id)
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
        .map((target) => ({
          target,
          tasks: model.tasks
            .filter((t) => t.targetId === target.id)
            .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
        }));
      return { project, targets };
    });
}

export function statsFor(model: VaultModel) {
  const tasks = model.tasks;
  const done = tasks.filter((t) => t.status === "done").length;
  const total = tasks.length;
  const blocked = tasks.filter((t) => t.status === "blocked").length;
  const inProgress = tasks.filter((t) => t.status === "in-progress").length;
  const overdue = tasks.filter((t) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "done").length;
  const poolReqs = model.requirements.filter((r) => r.status === "pool").length;
  return {
    projects: model.projects.length,
    targets: model.targets.length,
    tasksTotal: total,
    tasksDone: done,
    tasksInProgress: inProgress,
    blocked,
    overdue,
    poolReqs,
    completion: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

export default PmStore;
