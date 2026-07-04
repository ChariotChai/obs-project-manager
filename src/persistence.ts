import { App, TFile, TFolder, normalizePath, Notice } from "obsidian";
import type {
  PmSettings,
  Solution,
  Project,
  Target,
  Task,
  Requirement,
  VaultModel,
  JiraRef,
  ProjectStatus,
  TargetStatus,
  TaskStatus,
  Priority,
  RequirementStatus,
} from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { genId, slugify, joinPath, normalizeFolder } from "./util";
import { PROJECT_PALETTE } from "./constants";

// Folder/file layout inside the vault:
//   <solutionsFolder>/<solSlug>/solution.md
//   <solutionsFolder>/<solSlug>/_requirements/<id>.md
//   <solutionsFolder>/<solSlug>/projects/<projSlug>/project.md
//   <solutionsFolder>/<solSlug>/projects/<projSlug>/targets/<tSlug>/target.md
//   <solutionsFolder>/<solSlug>/projects/<projSlug>/targets/<tSlug>/tasks/<id>.md

const SOLUTION_FILE = "solution.md";
const PROJECT_FILE = "project.md";
const TARGET_FILE = "target.md";
const REQUIREMENTS_DIR = "_requirements";
const PROJECTS_DIR = "projects";
const TARGETS_DIR = "targets";
const TASKS_DIR = "tasks";

type FM = Record<string, any>;

function asArray(v: any): any[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  return [v];
}

function asJiraRefs(v: any): JiraRef[] {
  return asArray(v)
    .map((x: any) => {
      if (typeof x === "string") return { key: x };
      return { key: x?.key ?? "", title: x?.title, url: x?.url };
    })
    .filter((r: JiraRef) => r.key);
}

function asStrings(v: any): string[] {
  return asArray(v)
    .map((x: any) => (typeof x === "string" ? x : String(x ?? "")))
    .filter((s: string) => s.length > 0);
}

function num(v: any, def?: number): number | undefined {
  if (v == null || v === "") return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function str(v: any, def?: string): string | undefined {
  if (v == null) return def;
  return String(v);
}

function dateStr(v: any): string | undefined {
  if (v == null || v === "") return undefined;
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

function ts(v: any, def: number): number {
  const n = num(v, def);
  return n ?? def;
}

export class Persistence {
  constructor(private app: App, private settings: PmSettings) {}

  updateSettings(settings: PmSettings) {
    this.settings = settings;
  }

  get solutionsFolder(): string {
    return normalizeFolder(this.settings.solutionsFolder || DEFAULT_SETTINGS.solutionsFolder);
  }

  // ---- Path builders ----

  private solutionPath(slug: string): string {
    return joinPath(this.solutionsFolder, slug);
  }
  private solutionFilePath(slug: string): string {
    return joinPath(this.solutionPath(slug), SOLUTION_FILE);
  }
  private requirementsPath(slug: string): string {
    return joinPath(this.solutionPath(slug), REQUIREMENTS_DIR);
  }
  private projectsPath(slug: string): string {
    return joinPath(this.solutionPath(slug), PROJECTS_DIR);
  }
  private projectPath(slug: string, projSlug: string): string {
    return joinPath(this.projectsPath(slug), projSlug);
  }
  private projectFilePath(slug: string, projSlug: string): string {
    return joinPath(this.projectPath(slug, projSlug), PROJECT_FILE);
  }
  private targetsPath(slug: string, projSlug: string): string {
    return joinPath(this.projectPath(slug, projSlug), TARGETS_DIR);
  }
  private targetPath(slug: string, projSlug: string, tSlug: string): string {
    return joinPath(this.targetsPath(slug, projSlug), tSlug);
  }
  private targetFilePath(slug: string, projSlug: string, tSlug: string): string {
    return joinPath(this.targetPath(slug, projSlug, tSlug), TARGET_FILE);
  }
  private tasksPath(slug: string, projSlug: string, tSlug: string): string {
    return joinPath(this.targetPath(slug, projSlug, tSlug), TASKS_DIR);
  }

  // ---- Path parsers (resolve slugs from a known file path) ----

  /** From `.../<solSlug>/projects/<projSlug>/project.md` -> { solSlug, projSlug } */
  private splitProjectPath(path: string): { solSlug: string; projSlug: string } {
    const parts = path.split("/");
    const idx = parts.indexOf(PROJECTS_DIR);
    return { solSlug: parts[idx - 1] ?? "", projSlug: parts[idx + 1] ?? "" };
  }

  /** From `.../<solSlug>/projects/<projSlug>/targets/<tSlug>/target.md` */
  private splitTargetPath(path: string): { solSlug: string; projSlug: string; tSlug: string } {
    // parts: [..., solSlug, "projects", projSlug, "targets", tSlug, "target.md"]
    const parts = path.split("/");
    const idx = parts.indexOf(TARGETS_DIR);
    return {
      solSlug: parts[idx - 3] ?? "",
      projSlug: parts[idx - 1] ?? "",
      tSlug: parts[idx + 1] ?? "",
    };
  }

  // ---- Low level IO ----

  private async ensureFolder(path: string): Promise<void> {
    const n = normalizePath(path);
    if (this.app.vault.getAbstractFileByPath(n) == null) {
      await this.app.vault.createFolder(n).catch(() => {});
    }
  }

  private fm(file: TFile): FM | null {
    const cache = this.app.metadataCache.getFileCache(file);
    return (cache?.frontmatter as FM) ?? null;
  }

  private async writeFile(path: string, fm: FM, body: string): Promise<TFile> {
    const n = normalizePath(path);
    const parent = n.split("/").slice(0, -1).join("/");
    if (parent) await this.ensureFolder(parent);
    const existing = this.app.vault.getAbstractFileByPath(n);
    const content = `---\n${this.toYaml(fm)}---\n\n${body.trim() ? body.trim() + "\n" : ""}`;
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
      return existing;
    }
    return await this.app.vault.create(n, content);
  }

  private toYaml(fm: FM): string {
    const lines: string[] = [];
    for (const [key, value] of Object.entries(fm)) {
      const line = this.toYamlLine(key, value);
      if (line) lines.push(line);
    }
    return lines.join("");
  }

  private toYamlLine(key: string, value: any): string {
    if (value == null) return "";
    if (Array.isArray(value)) {
      if (value.length === 0) return "";
      let out = `${key}:\n`;
      for (const item of value) {
        if (item != null && typeof item === "object") {
          out += `  - ${this.inlineObj(item)}\n`;
        } else {
          out += `  - ${this.quoteScalar(item)}\n`;
        }
      }
      return out;
    }
    if (typeof value === "object") {
      return `${key}:\n  ${this.inlineObj(value, "  ")}\n`;
    }
    return `${key}: ${this.quoteScalar(value)}\n`;
  }

  private inlineObj(obj: any, indent = ""): string {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(obj)) {
      if (v == null || v === "") continue;
      parts.push(`${k}: ${this.quoteScalar(v)}`);
    }
    return parts.join(`\n${indent}- `);
  }

  private quoteScalar(v: any): string {
    if (v == null) return '""';
    const s = String(v);
    if (s === "") return '""';
    if (/^[\d.]+$/.test(s) || /[:#\-?\n[\]{}&*!|>'"%@`,]/.test(s) || s !== s.trim()) {
      return JSON.stringify(s);
    }
    return s;
  }

  private async deleteFile(path: string): Promise<void> {
    const f = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (f instanceof TFile) await this.app.vault.delete(f, true);
  }

  private mdFiles(folder: TFolder): TFile[] {
    return folder.children.filter((c): c is TFile => c instanceof TFile && c.extension === "md");
  }

  // ---- Solution ----

  listSolutions(): { slug: string; path: string }[] {
    const root = this.app.vault.getAbstractFileByPath(normalizePath(this.solutionsFolder));
    if (!(root instanceof TFolder)) return [];
    const out: { slug: string; path: string }[] = [];
    for (const child of root.children) {
      if (child instanceof TFolder) {
        const sf = child.children.find((c) => c.path === joinPath(child.path, SOLUTION_FILE));
        if (sf instanceof TFile) out.push({ slug: child.name, path: child.path });
      }
    }
    return out;
  }

  private parseSolution(file: TFile, slug: string): Solution | null {
    const fm = this.fm(file);
    if (!fm) return null;
    return {
      id: str(fm.id, slug) ?? slug,
      kind: "solution",
      path: file.path,
      name: str(fm.name, slug) ?? slug,
      createdAt: ts(fm.createdAt, file.stat.ctime),
      updatedAt: ts(fm.updatedAt, file.stat.mtime),
      description: str(fm.description),
      members: asStrings(fm.members),
    };
  }

  async ensureSolution(slug: string, name: string): Promise<Solution> {
    const filePath = this.solutionFilePath(slug);
    const existing = this.app.vault.getAbstractFileByPath(normalizePath(filePath));
    if (existing instanceof TFile) {
      const parsed = this.parseSolution(existing, slug);
      if (parsed) return parsed;
    }
    const now = Date.now();
    const fm: FM = { kind: "solution", id: genId("sol-"), name, createdAt: now, updatedAt: now, members: [] };
    await this.writeFile(filePath, fm, `# ${name}\n\nSolution workspace.`);
    const file = this.app.vault.getAbstractFileByPath(normalizePath(filePath)) as TFile;
    return this.parseSolution(file, slug)!;
  }

  async updateSolution(solution: Solution, patch: Partial<Solution>): Promise<Solution> {
    const next: Solution = { ...solution, ...patch, updatedAt: Date.now() };
    await this.writeFile(solution.path, this.solutionFM(next), `# ${next.name}`);
    return next;
  }

  private solutionFM(s: Solution): FM {
    return {
      kind: "solution",
      id: s.id,
      name: s.name,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      description: s.description,
      members: s.members,
    };
  }

  // ---- Loading ----

  async loadModel(solutionSlug: string): Promise<VaultModel | null> {
    const solFile = this.app.vault.getAbstractFileByPath(
      normalizePath(this.solutionFilePath(solutionSlug))
    );
    if (!(solFile instanceof TFile)) return null;
    const solution = this.parseSolution(solFile, solutionSlug);
    if (!solution) return null;

    const projects: Project[] = [];
    const targets: Target[] = [];
    const tasks: Task[] = [];
    const requirements: Requirement[] = [];

    const solFolder = this.app.vault.getAbstractFileByPath(
      normalizePath(this.solutionPath(solutionSlug))
    );
    if (solFolder instanceof TFolder) {
      const reqDir = solFolder.children.find(
        (c) => c.path === joinPath(solFolder.path, REQUIREMENTS_DIR)
      );
      if (reqDir instanceof TFolder) {
        for (const f of this.mdFiles(reqDir)) {
          const r = this.parseRequirement(f, solution.id);
          if (r) requirements.push(r);
        }
      }
      const projDir = solFolder.children.find(
        (c) => c.path === joinPath(solFolder.path, PROJECTS_DIR)
      );
      if (projDir instanceof TFolder) {
        for (const pFolder of projDir.children) {
          if (!(pFolder instanceof TFolder)) continue;
          const pf = pFolder.children.find(
            (c) => c.path === joinPath(pFolder.path, PROJECT_FILE)
          );
          if (!(pf instanceof TFile)) continue;
          const project = this.parseProject(pf, solution.id, pFolder.name);
          if (!project) continue;
          projects.push(project);
          const tdir = pFolder.children.find(
            (c) => c.path === joinPath(pFolder.path, TARGETS_DIR)
          );
          if (!(tdir instanceof TFolder)) continue;
          for (const tFolder of tdir.children) {
            if (!(tFolder instanceof TFolder)) continue;
            const tf = tFolder.children.find(
              (c) => c.path === joinPath(tFolder.path, TARGET_FILE)
            );
            if (!(tf instanceof TFile)) continue;
            const target = this.parseTarget(tf, project.id, solution.id, tFolder.name);
            if (!target) continue;
            targets.push(target);
            const taskDir = tFolder.children.find(
              (c) => c.path === joinPath(tFolder.path, TASKS_DIR)
            );
            if (taskDir instanceof TFolder) {
              for (const taskFile of this.mdFiles(taskDir)) {
                const task = this.parseTask(taskFile, target.id, project.id, solution.id);
                if (task) tasks.push(task);
              }
            }
          }
        }
      }
    }

    return { solution, projects, targets, tasks, requirements };
  }

  private parseProject(file: TFile, solutionId: string, slug: string): Project | null {
    const fm = this.fm(file);
    if (!fm || fm.kind !== "project") return null;
    return {
      id: str(fm.id, slug) ?? slug,
      kind: "project",
      path: file.path,
      solutionId,
      name: str(fm.name, slug) ?? slug,
      owner: str(fm.owner),
      startDate: dateStr(fm.startDate),
      endDate: dateStr(fm.endDate),
      status: (str(fm.status, "planning") as ProjectStatus) ?? "planning",
      jiraEpics: asJiraRefs(fm.jiraEpics),
      members: asStrings(fm.members),
      color: str(fm.color, PROJECT_PALETTE[0]),
      createdAt: ts(fm.createdAt, file.stat.ctime),
      updatedAt: ts(fm.updatedAt, file.stat.mtime),
      description: str(fm.description),
    };
  }

  private parseTarget(file: TFile, projectId: string, solutionId: string, slug: string): Target | null {
    const fm = this.fm(file);
    if (!fm || fm.kind !== "target") return null;
    return {
      id: str(fm.id, slug) ?? slug,
      kind: "target",
      path: file.path,
      projectId,
      solutionId,
      name: str(fm.name, slug) ?? slug,
      owner: str(fm.owner),
      startDate: dateStr(fm.startDate),
      endDate: dateStr(fm.endDate),
      status: (str(fm.status, "planning") as TargetStatus) ?? "planning",
      dependencies: asStrings(fm.dependencies),
      color: str(fm.color),
      createdAt: ts(fm.createdAt, file.stat.ctime),
      updatedAt: ts(fm.updatedAt, file.stat.mtime),
      description: str(fm.description),
    };
  }

  private parseTask(file: TFile, targetId: string, projectId: string, solutionId: string): Task | null {
    const fm = this.fm(file);
    if (!fm || fm.kind !== "task") return null;
    return {
      id: str(fm.id) ?? file.basename,
      kind: "task",
      path: file.path,
      targetId,
      projectId,
      solutionId,
      name: str(fm.name) ?? file.basename,
      owner: str(fm.owner),
      status: (str(fm.status, "todo") as TaskStatus) ?? "todo",
      startDate: dateStr(fm.startDate),
      dueDate: dateStr(fm.dueDate),
      priority: (str(fm.priority, "medium") as Priority) ?? "medium",
      jiraStories: asJiraRefs(fm.jiraStories),
      estimate: num(fm.estimate),
      createdAt: ts(fm.createdAt, file.stat.ctime),
      updatedAt: ts(fm.updatedAt, file.stat.mtime),
      description: str(fm.description),
    };
  }

  private parseRequirement(file: TFile, solutionId: string): Requirement | null {
    const fm = this.fm(file);
    if (!fm || fm.kind !== "requirement") return null;
    return {
      id: str(fm.id) ?? file.basename,
      kind: "requirement",
      path: file.path,
      solutionId,
      title: str(fm.title) ?? str(fm.name) ?? file.basename,
      source: str(fm.source),
      status: (str(fm.status, "pool") as RequirementStatus) ?? "pool",
      assignedProjectId: str(fm.assignedProjectId),
      priority: (str(fm.priority, "medium") as Priority) ?? "medium",
      triagedAt: num(fm.triagedAt),
      createdAt: ts(fm.createdAt, file.stat.ctime),
      updatedAt: ts(fm.updatedAt, file.stat.mtime),
      description: str(fm.description),
      tags: asStrings(fm.tags),
    };
  }

  // ---- Mutations: Projects ----

  async createProject(input: {
    solution: Solution;
    name: string;
    owner?: string;
    startDate?: string;
    endDate?: string;
    status?: ProjectStatus;
    description?: string;
  }): Promise<Project> {
    const solSlug = this.slugOf(input.solution);
    const projSlug = this.uniqueSlug(solSlug, input.name, "project");
    const now = Date.now();
    const project: Project = {
      id: genId("prj-"),
      kind: "project",
      path: this.projectFilePath(solSlug, projSlug),
      solutionId: input.solution.id,
      name: input.name,
      owner: input.owner,
      startDate: input.startDate,
      endDate: input.endDate,
      status: input.status ?? "planning",
      jiraEpics: [],
      members: input.owner ? [input.owner] : [],
      color: PROJECT_PALETTE[Math.floor(Math.random() * PROJECT_PALETTE.length)],
      createdAt: now,
      updatedAt: now,
      description: input.description,
    };
    await this.writeFile(project.path, this.projectFM(project), `# ${project.name}`);
    return project;
  }

  async updateProject(project: Project, patch: Partial<Project>): Promise<Project> {
    const next: Project = { ...project, ...patch, updatedAt: Date.now() };
    await this.writeFile(project.path, this.projectFM(next), `# ${next.name}`);
    return next;
  }

  private projectFM(p: Project): FM {
    return {
      kind: "project",
      id: p.id,
      name: p.name,
      owner: p.owner,
      startDate: p.startDate,
      endDate: p.endDate,
      status: p.status,
      jiraEpics: p.jiraEpics,
      members: p.members,
      color: p.color,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      description: p.description,
    };
  }

  // ---- Mutations: Targets ----

  async createTarget(input: {
    solution: Solution;
    project: Project;
    name: string;
    owner?: string;
    startDate?: string;
    endDate?: string;
    status?: TargetStatus;
    description?: string;
  }): Promise<Target> {
    const { solSlug, projSlug } = this.splitProjectPath(input.project.path);
    const tSlug = this.uniqueTargetSlug(solSlug, projSlug, input.name);
    const now = Date.now();
    const target: Target = {
      id: genId("tgt-"),
      kind: "target",
      path: this.targetFilePath(solSlug, projSlug, tSlug),
      projectId: input.project.id,
      solutionId: input.solution.id,
      name: input.name,
      owner: input.owner,
      startDate: input.startDate,
      endDate: input.endDate,
      status: input.status ?? "planning",
      dependencies: [],
      color: input.project.color,
      createdAt: now,
      updatedAt: now,
      description: input.description,
    };
    await this.writeFile(target.path, this.targetFM(target), `# ${target.name}`);
    return target;
  }

  async updateTarget(target: Target, patch: Partial<Target>): Promise<Target> {
    const next: Target = { ...target, ...patch, updatedAt: Date.now() };
    await this.writeFile(target.path, this.targetFM(next), `# ${next.name}`);
    return next;
  }

  private targetFM(t: Target): FM {
    return {
      kind: "target",
      id: t.id,
      name: t.name,
      owner: t.owner,
      startDate: t.startDate,
      endDate: t.endDate,
      status: t.status,
      dependencies: t.dependencies,
      color: t.color,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      description: t.description,
    };
  }

  // ---- Mutations: Tasks ----

  async createTask(input: {
    solution: Solution;
    project: Project;
    target: Target;
    name: string;
    owner?: string;
    status?: TaskStatus;
    dueDate?: string;
    priority?: Priority;
    description?: string;
  }): Promise<Task> {
    const { solSlug, projSlug, tSlug } = this.splitTargetPath(input.target.path);
    const now = Date.now();
    const id = genId("tsk-");
    const task: Task = {
      id,
      kind: "task",
      path: joinPath(this.tasksPath(solSlug, projSlug, tSlug), `${id}.md`),
      targetId: input.target.id,
      projectId: input.project.id,
      solutionId: input.solution.id,
      name: input.name,
      owner: input.owner,
      status: input.status ?? "todo",
      dueDate: input.dueDate,
      priority: input.priority ?? "medium",
      jiraStories: [],
      createdAt: now,
      updatedAt: now,
      description: input.description,
    };
    await this.writeFile(task.path, this.taskFM(task), `# ${task.name}`);
    return task;
  }

  async updateTask(task: Task, patch: Partial<Task>): Promise<Task> {
    const next: Task = { ...task, ...patch, updatedAt: Date.now() };
    await this.writeFile(task.path, this.taskFM(next), `# ${next.name}`);
    return next;
  }

  private taskFM(t: Task): FM {
    return {
      kind: "task",
      id: t.id,
      name: t.name,
      owner: t.owner,
      status: t.status,
      startDate: t.startDate,
      dueDate: t.dueDate,
      priority: t.priority,
      jiraStories: t.jiraStories,
      estimate: t.estimate,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      description: t.description,
    };
  }

  // ---- Mutations: Requirements ----

  async createRequirement(input: {
    solution: Solution;
    title: string;
    description?: string;
    source?: string;
    priority?: Priority;
  }): Promise<Requirement> {
    const solSlug = this.slugOf(input.solution);
    const now = Date.now();
    const id = genId("req-");
    const req: Requirement = {
      id,
      kind: "requirement",
      path: joinPath(this.requirementsPath(solSlug), `${id}.md`),
      solutionId: input.solution.id,
      title: input.title,
      description: input.description,
      source: input.source,
      status: "pool",
      priority: input.priority ?? "medium",
      createdAt: now,
      updatedAt: now,
      tags: [],
    };
    await this.writeFile(req.path, this.requirementFM(req), `# ${req.title}`);
    return req;
  }

  async updateRequirement(req: Requirement, patch: Partial<Requirement>): Promise<Requirement> {
    const next: Requirement = { ...req, ...patch, updatedAt: Date.now() };
    if (patch.status === "triaged" && !next.triagedAt) next.triagedAt = Date.now();
    await this.writeFile(req.path, this.requirementFM(next), `# ${next.title}`);
    return next;
  }

  private requirementFM(r: Requirement): FM {
    return {
      kind: "requirement",
      id: r.id,
      title: r.title,
      source: r.source,
      status: r.status,
      assignedProjectId: r.assignedProjectId,
      priority: r.priority,
      triagedAt: r.triagedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      description: r.description,
      tags: r.tags,
    };
  }

  // ---- Deletions ----

  async deleteProject(project: Project): Promise<void> {
    const { solSlug, projSlug } = this.splitProjectPath(project.path);
    const folder = this.app.vault.getAbstractFileByPath(
      normalizePath(this.projectPath(solSlug, projSlug))
    );
    if (folder instanceof TFolder) await this.app.vault.delete(folder, true);
  }

  async deleteTarget(target: Target): Promise<void> {
    const { solSlug, projSlug, tSlug } = this.splitTargetPath(target.path);
    const folder = this.app.vault.getAbstractFileByPath(
      normalizePath(this.targetPath(solSlug, projSlug, tSlug))
    );
    if (folder instanceof TFolder) await this.app.vault.delete(folder, true);
  }

  async deleteTask(task: Task): Promise<void> {
    await this.deleteFile(task.path);
  }

  async deleteRequirement(req: Requirement): Promise<void> {
    await this.deleteFile(req.path);
  }

  async openFile(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (file instanceof TFile) {
      await this.app.workspace.getLeaf(false).openFile(file);
    } else {
      new Notice("File not found");
    }
  }

  // ---- Slug helpers ----

  private slugOf(solution: Solution): string {
    // path = <solutionsFolder>/<solSlug>/solution.md
    const parts = solution.path.split("/");
    return parts[parts.length - 2] ?? parts[parts.length - 1];
  }

  private uniqueSlug(solSlug: string, name: string, _kind: string): string {
    const base = slugify(name);
    let candidate = base;
    let i = 2;
    while (
      this.app.vault.getAbstractFileByPath(
        normalizePath(this.projectFilePath(solSlug, candidate))
      ) instanceof TFile
    ) {
      candidate = `${base}-${i++}`;
    }
    return candidate;
  }

  private uniqueTargetSlug(solSlug: string, projSlug: string, name: string): string {
    const base = slugify(name);
    let candidate = base;
    let i = 2;
    while (
      this.app.vault.getAbstractFileByPath(
        normalizePath(this.targetFilePath(solSlug, projSlug, candidate))
      ) instanceof TFile
    ) {
      candidate = `${base}-${i++}`;
    }
    return candidate;
  }
}
