<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import Modal from "./components/Modal.svelte";
  import type PmStore from "../store";
  import type {
    Solution,
    Project,
    Target,
    Task,
    Requirement,
    ProjectStatus,
    TargetStatus,
    TaskStatus,
    Priority,
    RequirementStatus,
    JiraRef,
    StatusConfig,
  } from "../types";
  import {
    PROJECT_STATUSES,
    TARGET_STATUSES,
    TASK_STATUSES,
    PRIORITIES,
    REQUIREMENT_STATUSES,
    DEFAULT_STATUS_CONFIG,
    effectiveStatuses,
    statusLabel,
    priorityLabel,
  } from "../constants";

  const dispatch = createEventDispatcher();

  export let store: PmStore;
  export let mode: "create" | "edit";
  export let kind: "solution" | "project" | "target" | "task" | "requirement";
  export let entity: Solution | Project | Target | Task | Requirement | null;
  export let projectId: string | undefined;
  export let targetId: string | undefined;

  let name = "";
  let owner = "";
  let status: ProjectStatus | TargetStatus | TaskStatus | RequirementStatus = "planning";
  let priority: Priority = "medium";
  let startDate = "";
  let endDate = "";
  let dueDate = "";
  let description = "";
  let source = "";
  let projectMembers: string[] = [];
  let jiraKeys = "";
  let deps: string[] = [];
  let reqStatus: RequirementStatus = "pool";
  let newMemberName = "";
  let projectStatuses: string[] = [];
  let targetStatuses: string[] = [];
  let taskStatuses: string[] = [];
  let newProjectStatus = "";
  let newTargetStatus = "";
  let newTaskStatus = "";

  const model = store.model;

  $: projectTargets = $model.targets.filter((t) => t.projectId === projectId);
  $: solutionMembers = $model.solution.members;

  /**
   * Check whether adding `depId` as a dependency of `targetId` would create a
   * circular dependency. A cycle occurs when `targetId` is already reachable
   * from `depId` by following existing dependency edges (i.e. `depId`
   * transitively depends on `targetId`).
   *
   * In "create" mode there is no `targetId` yet, so no cycle is possible
   * (nothing in the vault depends on the not-yet-created target).
   */
  function wouldCreateCycle(targetId: string | undefined, depId: string, allTargets: Target[]): boolean {
    if (!targetId || targetId === depId) return true;
    const visited = new Set<string>();
    const stack = [depId];
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === targetId) return true;
      if (visited.has(cur)) continue;
      visited.add(cur);
      const t = allTargets.find((x) => x.id === cur);
      if (t) for (const d of t.dependencies) if (!visited.has(d)) stack.push(d);
    }
    return false;
  }

  /** Targets that may NOT be picked as a dependency for the entity being edited. */
  $: blockedDeps = new Set<string>(
    mode === "edit" && entity
      ? projectTargets
          .filter((t) => t.id !== (entity as Target).id)
          .filter((t) => wouldCreateCycle((entity as Target).id, t.id, $model.targets))
          .map((t) => t.id)
      : []
  );

  function addSolutionMember() {
    const trimmed = newMemberName.trim();
    if (trimmed && !projectMembers.includes(trimmed)) {
      projectMembers = [...projectMembers, trimmed];
      newMemberName = "";
    }
  }

  function removeSolutionMember(member: string) {
    projectMembers = projectMembers.filter((m) => m !== member);
  }

  function addStatus(kind: "project" | "target" | "task") {
    const v = (kind === "project" ? newProjectStatus : kind === "target" ? newTargetStatus : newTaskStatus).trim();
    if (!v) return;
    if (kind === "project") {
      if (!projectStatuses.includes(v)) projectStatuses = [...projectStatuses, v];
      newProjectStatus = "";
    } else if (kind === "target") {
      if (!targetStatuses.includes(v)) targetStatuses = [...targetStatuses, v];
      newTargetStatus = "";
    } else {
      if (!taskStatuses.includes(v)) taskStatuses = [...taskStatuses, v];
      newTaskStatus = "";
    }
  }

  function removeStatus(kind: "project" | "target" | "task", value: string) {
    if (kind === "project") projectStatuses = projectStatuses.filter((s) => s !== value);
    else if (kind === "target") targetStatuses = targetStatuses.filter((s) => s !== value);
    else taskStatuses = taskStatuses.filter((s) => s !== value);
  }

  function resetStatusesToDefault() {
    projectStatuses = [...DEFAULT_STATUS_CONFIG.project];
    targetStatuses = [...DEFAULT_STATUS_CONFIG.target];
    taskStatuses = [...DEFAULT_STATUS_CONFIG.task];
  }

  $: if (entity && mode === "edit") initFromEntity(entity);
  // Initialise defaults for a brand-new solution (no entity to load from).
  $: if (kind === "solution" && !entity && projectStatuses.length === 0 && targetStatuses.length === 0 && taskStatuses.length === 0) {
    projectStatuses = [...DEFAULT_STATUS_CONFIG.project];
    targetStatuses = [...DEFAULT_STATUS_CONFIG.target];
    taskStatuses = [...DEFAULT_STATUS_CONFIG.task];
  }

  function initFromEntity(e: any) {
    name = e.name ?? e.title ?? "";
    owner = e.owner ?? "";
    status = e.status ?? "planning";
    priority = e.priority ?? "medium";
    startDate = e.startDate ?? "";
    endDate = e.endDate ?? "";
    dueDate = e.dueDate ?? "";
    description = e.description ?? "";
    source = e.source ?? "";
    projectMembers = e.members ? [...e.members] : [];
    jiraKeys = (e.jiraEpics ?? e.jiraStories ?? []).map((j: JiraRef) => j.key).join(", ");
    deps = e.dependencies ? [...e.dependencies] : [];
    reqStatus = e.status === "pool" || e.status === "triaged" || e.status === "held" ? e.status : "pool";
    if (e.kind === "solution") {
      const cfg: StatusConfig | undefined = e.statusConfig;
      projectStatuses = cfg?.project?.length ? [...cfg.project] : [...DEFAULT_STATUS_CONFIG.project];
      targetStatuses = cfg?.target?.length ? [...cfg.target] : [...DEFAULT_STATUS_CONFIG.target];
      taskStatuses = cfg?.task?.length ? [...cfg.task] : [...DEFAULT_STATUS_CONFIG.task];
    }
  }

  function parseJira(s: string): JiraRef[] {
    return s
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((k) => ({ key: k }));
  }

  let saving = false;
  async function save() {
    if (kind !== "solution" && !name.trim()) return;
    saving = true;
    try {
      if (kind === "solution") {
        await store.updateSolution({
          name: name.trim(),
          description: description.trim() || undefined,
          members: projectMembers,
          statusConfig: { project: projectStatuses, target: targetStatuses, task: taskStatuses },
        });
      } else if (kind === "project") {
        const payload: any = {
          name: name.trim(),
          owner: owner || undefined,
          status,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          description: description.trim() || undefined,
        };
        if (mode === "create") await store.createProject(payload);
        else await store.updateProject((entity as Project).id, { ...payload, members: projectMembers, jiraEpics: parseJira(jiraKeys) });
      } else if (kind === "target") {
        const payload: any = {
          name: name.trim(),
          owner: owner || undefined,
          status: status as TargetStatus,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          description: description.trim() || undefined,
          dependencies: deps,
        };
        if (mode === "create" && projectId) await store.createTarget({ projectId, ...payload });
        else await store.updateTarget((entity as Target).id, payload);
      } else if (kind === "task") {
        const payload: any = {
          name: name.trim(),
          owner: owner || undefined,
          status: status as TaskStatus,
          dueDate: dueDate || undefined,
          priority,
          description: description.trim() || undefined,
        };
        if (mode === "create" && targetId) await store.createTask({ targetId, ...payload });
        else await store.updateTask((entity as Task).id, { ...payload, jiraStories: parseJira(jiraKeys) });
      } else if (kind === "requirement") {
        const payload: any = {
          title: name.trim(),
          source: source.trim() || undefined,
          priority,
          status: reqStatus,
          description: description.trim() || undefined,
        };
        if (mode === "create") await store.createRequirement(payload);
        else await store.updateRequirement((entity as Requirement).id, payload);
      }
      dispatch("close");
    } finally {
      saving = false;
    }
  }

  $: titleText = kind === "solution" ? "Solution Settings" : `${mode === "create" ? "New" : "Edit"} ${kind[0].toUpperCase() + kind.slice(1)}`;
  $: cfg = $model.solution.statusConfig;
  $: statuses =
    kind === "project" ? effectiveStatuses(cfg, "project")
    : kind === "target" ? effectiveStatuses(cfg, "target")
    : kind === "task" ? effectiveStatuses(cfg, "task")
    : [];
</script>

<Modal {titleText} width={560} on:close={() => dispatch("close")}>
  <div class="grid">
    {#if kind === "solution"}
      <label class="field full">
        <span>Name</span>
        <input bind:value={name} placeholder="Solution name" />
      </label>
      <label class="field full">
        <span>Members</span>
        <div class="members">
          <div class="member-add">
            <input bind:value={newMemberName} placeholder="Add member name" on:keydown={(e) => e.key === "Enter" && (e.preventDefault(), addSolutionMember())} />
            <button class="btn primary small" on:click={addSolutionMember}>+</button>
          </div>
          {#if projectMembers.length === 0}
            <p class="muted">No members configured yet. Add members above.</p>
          {/if}
          {#each projectMembers as m}
            <div class="member-tag">
              <span>{m}</span>
              <button class="remove" on:click={() => removeSolutionMember(m)}>×</button>
            </div>
          {/each}
        </div>
      </label>
      <div class="field full">
        <div class="status-head">
          <span>Status values</span>
          <button class="btn ghost-mini" on:click={resetStatusesToDefault} title="Restore defaults">Reset to defaults</button>
        </div>
        <p class="muted hint">Customise the status options shown for projects, targets and tasks. Enter a value and press Enter or click +.</p>
        <div class="status-grid">
          <div class="status-col">
            <div class="status-col-head">Project</div>
            <div class="member-add">
              <input bind:value={newProjectStatus} placeholder="e.g. archived" on:keydown={(e) => e.key === "Enter" && (e.preventDefault(), addStatus("project"))} />
              <button class="btn primary small" on:click={() => addStatus("project")}>+</button>
            </div>
            <div class="status-chips">
              {#each projectStatuses as s}
                <div class="member-tag">
                  <span>{statusLabel(s)}</span>
                  <button class="remove" on:click={() => removeStatus("project", s)}>×</button>
                </div>
              {/each}
            </div>
          </div>
          <div class="status-col">
            <div class="status-col-head">Target</div>
            <div class="member-add">
              <input bind:value={newTargetStatus} placeholder="e.g. review" on:keydown={(e) => e.key === "Enter" && (e.preventDefault(), addStatus("target"))} />
              <button class="btn primary small" on:click={() => addStatus("target")}>+</button>
            </div>
            <div class="status-chips">
              {#each targetStatuses as s}
                <div class="member-tag">
                  <span>{statusLabel(s)}</span>
                  <button class="remove" on:click={() => removeStatus("target", s)}>×</button>
                </div>
              {/each}
            </div>
          </div>
          <div class="status-col">
            <div class="status-col-head">Task</div>
            <div class="member-add">
              <input bind:value={newTaskStatus} placeholder="e.g. review" on:keydown={(e) => e.key === "Enter" && (e.preventDefault(), addStatus("task"))} />
              <button class="btn primary small" on:click={() => addStatus("task")}>+</button>
            </div>
            <div class="status-chips">
              {#each taskStatuses as s}
                <div class="member-tag">
                  <span>{statusLabel(s)}</span>
                  <button class="remove" on:click={() => removeStatus("task", s)}>×</button>
                </div>
              {/each}
            </div>
          </div>
        </div>
      </div>
      <label class="field full">
        <span>Description</span>
        <textarea bind:value={description} rows="3" placeholder="Notes…"></textarea>
      </label>
    {:else}
      <label class="field full">
        <span>{kind === "requirement" ? "Title" : "Name"}</span>
        <input bind:value={name} placeholder={kind === "requirement" ? "Requirement title" : "Name"} />
      </label>

      {#if kind !== "requirement"}
        <label class="field">
          <span>Owner</span>
          <select bind:value={owner}>
            <option value="">—</option>
            {#each solutionMembers as m}
              <option value={m}>{m}</option>
            {/each}
          </select>
        </label>
        <label class="field">
          <span>Status</span>
          <select bind:value={status}>
            {#each statuses as s}
              <option value={s}>{statusLabel(s)}</option>
            {/each}
          </select>
        </label>
      {/if}

      {#if kind === "project" || kind === "target"}
        <label class="field">
          <span>Start date</span>
          <input type="date" bind:value={startDate} />
        </label>
        <label class="field">
          <span>End date</span>
          <input type="date" bind:value={endDate} />
        </label>
      {/if}

      {#if kind === "task"}
        <label class="field">
          <span>Due date</span>
          <input type="date" bind:value={dueDate} />
        </label>
        <label class="field">
          <span>Priority</span>
          <select bind:value={priority}>
            {#each PRIORITIES as p}
              <option value={p}>{priorityLabel(p)}</option>
            {/each}
          </select>
        </label>
      {/if}

      {#if kind === "requirement"}
        <label class="field">
          <span>Source</span>
          <input bind:value={source} placeholder="Who raised it" />
        </label>
        <label class="field">
          <span>Priority</span>
          <select bind:value={priority}>
            {#each PRIORITIES as p}
              <option value={p}>{priorityLabel(p)}</option>
            {/each}
          </select>
        </label>
        <label class="field full">
          <span>Status</span>
          <select bind:value={reqStatus}>
            {#each REQUIREMENT_STATUSES as s}
              <option value={s}>{statusLabel(s)}</option>
            {/each}
          </select>
        </label>
      {/if}

      {#if kind === "target"}
        <div class="field full">
          <span>Dependencies</span>
          <div class="deps">
            {#if projectTargets.length === 0 || (projectTargets.length === 1 && projectTargets[0].id === entity?.id)}
              <p class="muted">No other targets in this project yet.</p>
            {/if}
            {#each projectTargets as t (t.id)}
              {#if entity?.id !== t.id}
                {@const blocked = blockedDeps.has(t.id)}
                <label class="check" class:disabled={blocked} title={blocked ? "Cannot select: would create a circular dependency" : ""}>
                  <input type="checkbox" value={t.id} bind:group={deps} disabled={blocked} />
                  <span>{t.name}</span>
                  {#if blocked}<span class="cycle-warn">↻</span>{/if}
                </label>
              {/if}
            {/each}
          </div>
        </div>
      {/if}

      {#if kind === "project" && mode === "edit"}
        <label class="field full">
          <span>Members</span>
          <div class="members">
            {#if solutionMembers.length === 0}
              <p class="muted">No solution members configured. Add members in Solution Settings first.</p>
            {/if}
            {#each solutionMembers as m}
              <label class="check">
                <input type="checkbox" value={m} bind:group={projectMembers} />
                <span>{m}</span>
              </label>
            {/each}
          </div>
        </label>
        <label class="field full">
          <span>Jira epics (keys, comma separated)</span>
          <input bind:value={jiraKeys} placeholder="ENG-100, ENG-101" />
        </label>
      {/if}

      {#if kind === "task" && mode === "edit"}
        <label class="field full">
          <span>Jira stories (keys, comma separated)</span>
          <input bind:value={jiraKeys} placeholder="ENG-200, ENG-201" />
        </label>
      {/if}

      <label class="field full">
        <span>Description</span>
        <textarea bind:value={description} rows="3" placeholder="Notes…"></textarea>
      </label>
    {/if}
  </div>

  <svelte:fragment slot="footer">
    <button class="btn ghost" on:click={() => dispatch("close")}>Cancel</button>
    <button class="btn primary" on:click={save} disabled={saving || (kind !== "solution" && !name.trim())}>
      {saving ? "Saving…" : "Save"}
    </button>
  </svelte:fragment>
</Modal>

<style>
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px 14px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 12px;
    color: var(--pm-muted, #8e8e93);
    font-weight: 500;
  }
  .full {
    grid-column: 1 / -1;
  }
  .field :global(input),
  .field :global(textarea),
  .field :global(select) {
    font: inherit;
    font-size: 13px;
    color: var(--pm-text, #1d1d1f);
    padding: 8px 10px;
    border: 1px solid var(--pm-border, rgba(0, 0, 0, 0.1));
    border-radius: 9px;
    background: var(--pm-input, #fff);
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .field :global(input:focus),
  .field :global(textarea:focus),
  .field :global(select:focus) {
    border-color: #007aff;
    box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.15);
  }
  .deps,
  .members {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 2px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--pm-text, #1d1d1f);
    font-weight: 400;
    cursor: pointer;
  }
  .check.disabled {
    color: var(--pm-muted, #8e8e93);
    cursor: not-allowed;
    opacity: 0.55;
  }
  .cycle-warn {
    margin-left: auto;
    color: #ff9f0a;
    font-size: 13px;
    font-weight: 700;
  }
  .muted {
    color: var(--pm-muted, #8e8e93);
    font-size: 12px;
    margin: 0;
  }
  .member-add {
    display: flex;
    gap: 8px;
  }
  .member-add :global(input) {
    flex: 1;
  }
  .btn.small {
    padding: 8px 12px;
    font-size: 12px;
  }
  .member-tag {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--pm-col, rgba(0, 0, 0, 0.05));
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 12px;
    color: var(--pm-text, #1d1d1f);
  }
  .member-tag .remove {
    border: none;
    background: transparent;
    color: var(--pm-muted, #8e8e93);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    padding: 0;
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: background 0.15s;
  }
  .member-tag .remove:hover {
    color: var(--pm-text, #1d1d1f);
    background: rgba(0, 0, 0, 0.08);
  }
  .status-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .ghost-mini {
    border: 1px solid var(--pm-border, rgba(0, 0, 0, 0.12));
    background: transparent;
    color: var(--pm-accent, #007aff);
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 7px;
    cursor: pointer;
  }
  .ghost-mini:hover {
    background: var(--pm-hover, rgba(0, 0, 0, 0.04));
  }
  .hint {
    margin: 2px 0 4px;
  }
  .status-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 12px;
  }
  .status-col {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .status-col-head {
    font-size: 11px;
    font-weight: 600;
    color: var(--pm-text, #1d1d1f);
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }
  .status-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    min-height: 8px;
  }
</style>
