<script lang="ts">
  import type PmStore from "../store";
  import type { Project, Target, Task, Requirement, Priority } from "../types";
  import {
    PROJECT_STATUSES,
    TARGET_STATUSES,
    TASK_STATUSES,
    REQUIREMENT_STATUSES,
    PRIORITIES,
    statusLabel,
    priorityLabel,
    PRIORITY_COLORS,
  } from "../constants";
  import Avatar from "./components/Avatar.svelte";
  import Progress from "./components/Progress.svelte";
  import Badge from "./components/Badge.svelte";

  export let store: PmStore;
  const model = store.model;
  const selection = store.selection;

  $: sel = $selection;
  $: selectedProject = sel.kind === "project" ? $model.projects.find((p) => p.id === sel.id) ?? null : null;
  $: selectedTarget = sel.kind === "target" ? $model.targets.find((t) => t.id === sel.id) ?? null : null;
  $: selectedTask = sel.kind === "task" ? $model.tasks.find((t) => t.id === sel.id) ?? null : null;
  $: selectedRequirement = sel.kind === "requirement" ? $model.requirements.find((r) => r.id === sel.id) ?? null : null;
  $: hasSelection = !!(selectedProject || selectedTarget || selectedTask || selectedRequirement);
  $: updatedTs = (selectedProject ?? selectedTarget ?? selectedTask ?? selectedRequirement)?.updatedAt;
  $: parentProject = selectedTarget
    ? $model.projects.find((p) => p.id === selectedTarget.projectId)
    : selectedTask
    ? $model.projects.find((p) => p.id === selectedTask.projectId)
    : undefined;
  $: parentTarget = selectedTask ? $model.targets.find((t) => t.id === selectedTask.targetId) : undefined;

  function field(e: Event): string {
    return (e.currentTarget as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
  }

  function update(patch: Record<string, any>) {
    if (selectedProject) store.updateProject(selectedProject.id, patch);
    else if (selectedTarget) store.updateTarget(selectedTarget.id, patch);
    else if (selectedTask) store.updateTask(selectedTask.id, patch);
    else if (selectedRequirement) store.updateRequirement(selectedRequirement.id, patch);
  }

  function remove() {
    if (selectedProject) store.deleteProject(selectedProject.id);
    else if (selectedTarget) store.deleteTarget(selectedTarget.id);
    else if (selectedTask) store.deleteTask(selectedTask.id);
    else if (selectedRequirement) store.deleteRequirement(selectedRequirement.id);
  }

  function edit() {
    if (!sel.kind) return;
    const kind = sel.kind as "project" | "target" | "task" | "requirement";
    const entity = selectedProject ?? selectedTarget ?? selectedTask ?? selectedRequirement;
    store.openEditor({
      mode: "edit",
      kind,
      entity: entity ?? null,
      projectId: (selectedTarget ?? selectedTask)?.projectId,
      targetId: selectedTask?.targetId,
    });
  }

  function openFile() {
    if (!sel.kind || !sel.id) return;
    store.openEntity(sel.kind, sel.id);
  }

  function taskDone(id: string, done: boolean) {
    store.updateTask(id, { status: done ? "done" : "todo" });
  }

  function depTargets(): Target[] {
    if (!selectedTarget) return [];
    return $model.targets.filter((t) => t.projectId === selectedTarget.projectId && t.id !== selectedTarget.id);
  }
  function toggleDep(id: string) {
    if (!selectedTarget) return;
    const has = selectedTarget.dependencies.includes(id);
    update({ dependencies: has ? selectedTarget.dependencies.filter((d) => d !== id) : [...selectedTarget.dependencies, id] });
  }
  function depName(id: string): string {
    return $model.targets.find((t) => t.id === id)?.name ?? id;
  }

  function projectTaskStats(id: string) {
    const ts = $model.tasks.filter((t) => t.projectId === id);
    return { total: ts.length, done: ts.filter((t) => t.status === "done").length };
  }

  function fmtDate(d?: string) {
    if (!d) return "—";
    try {
      return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch {
      return d;
    }
  }
  function fmtTs(t?: number) {
    if (!t) return "";
    return new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }
</script>

<div class="detail">
  {#if !hasSelection}
    <div class="placeholder">
      <svg viewBox="0 0 64 64" width="48" height="48"><path fill="currentColor" opacity="0.4" d="M32 6a26 26 0 1 0 0 52 26 26 0 0 0 0-52zm0 6a20 20 0 1 1 0 40 20 20 0 0 1 0-40zm-2 9a3 3 0 1 1 6 0v11a3 3 0 1 1-6 0zm0 17a3 3 0 1 1 6 0 3 3 0 0 1-6 0z"/></svg>
      <p>Select an item to view details</p>
    </div>
  {:else if selectedTask}
    <div class="d-head">
      <button class="tick" class:checked={selectedTask.status === "done"} on:click={() => taskDone(selectedTask.id, selectedTask.status !== "done")}></button>
      <div class="d-title">{selectedTask.name}</div>
    </div>
    <div class="d-badges">
      <Badge color={PRIORITY_COLORS[selectedTask.priority]} label={priorityLabel(selectedTask.priority)} />
      <Badge color="#8E8E93" label={statusLabel(selectedTask.status)} />
    </div>

    <div class="d-section">
      <div class="d-row">
        <span class="lbl">Owner</span>
        <div class="val">
          {#if selectedTask.owner}<Avatar name={selectedTask.owner} size={18} />{/if}
          <select class="inline" value={selectedTask.owner ?? ""} on:change={(e) => update({ owner: field(e) || undefined })}>
            <option value="">—</option>
            {#each $model.solution.members as m}
              <option value={m}>{m}</option>
            {/each}
          </select>
        </div>
      </div>
      <div class="d-row">
        <span class="lbl">Status</span>
        <select value={selectedTask.status} on:change={(e) => update({ status: field(e) })}>
          {#each TASK_STATUSES as s}
            <option value={s}>{statusLabel(s)}</option>
          {/each}
        </select>
      </div>
      <div class="d-row">
        <span class="lbl">Priority</span>
        <select value={selectedTask.priority} on:change={(e) => update({ priority: field(e) })}>
          {#each PRIORITIES as p}
            <option value={p}>{priorityLabel(p)}</option>
          {/each}
        </select>
      </div>
      <div class="d-row">
        <span class="lbl">Due date</span>
        <input type="date" value={selectedTask.dueDate ?? ""} on:change={(e) => update({ dueDate: field(e) || undefined })} />
      </div>
      <div class="d-row">
        <span class="lbl">Target</span>
        <span class="val muted">{parentTarget?.name ?? "—"}</span>
      </div>
    </div>

    {#if selectedTask.description}
      <div class="d-section">
        <div class="lbl">Description</div>
        <p class="desc">{selectedTask.description}</p>
      </div>
    {/if}

    {#if selectedTask.jiraStories.length}
      <div class="d-section">
        <div class="lbl">Jira stories</div>
        <div class="jira-list">
          {#each selectedTask.jiraStories as j}
            <span class="jira-key">{j.key}</span>
          {/each}
        </div>
      </div>
    {/if}
  {:else if selectedProject}
    {@const st = projectTaskStats(selectedProject.id)}
    <div class="d-head">
      <span class="bar" style="background:{selectedProject.color}"></span>
      <div class="d-title">{selectedProject.name}</div>
    </div>
    <div class="d-badges">
      <Badge color="#8E8E93" label={statusLabel(selectedProject.status)} />
      {#if selectedProject.owner}<Badge color="#007AFF" label={selectedProject.owner} />{/if}
    </div>

    <div class="d-section">
      <div class="lbl">Completion</div>
      <Progress value={st.total ? (st.done / st.total) * 100 : 0} label={`${st.done}/${st.total}`} />
    </div>

    <div class="d-section">
      <div class="d-row">
        <span class="lbl">Owner</span>
        <select class="inline" value={selectedProject.owner ?? ""} on:change={(e) => update({ owner: field(e) || undefined })}>
          <option value="">—</option>
          {#each $model.solution.members as m}
            <option value={m}>{m}</option>
          {/each}
        </select>
      </div>
      <div class="d-row">
        <span class="lbl">Status</span>
        <select value={selectedProject.status} on:change={(e) => update({ status: field(e) })}>
          {#each PROJECT_STATUSES as s}
            <option value={s}>{statusLabel(s)}</option>
          {/each}
        </select>
      </div>
      <div class="d-row">
        <span class="lbl">Start</span>
        <input type="date" value={selectedProject.startDate ?? ""} on:change={(e) => update({ startDate: field(e) || undefined })} />
      </div>
      <div class="d-row">
        <span class="lbl">End</span>
        <input type="date" value={selectedProject.endDate ?? ""} on:change={(e) => update({ endDate: field(e) || undefined })} />
      </div>
    </div>

    {#if selectedProject.jiraEpics.length}
      <div class="d-section">
        <div class="lbl">Jira epics</div>
        <div class="jira-list">
          {#each selectedProject.jiraEpics as j}
            <span class="jira-key">{j.key}</span>
          {/each}
        </div>
      </div>
    {/if}
  {:else if selectedTarget}
    <div class="d-head">
      <span class="bar" style="background:{selectedTarget.color ?? parentProject?.color}"></span>
      <div class="d-title">{selectedTarget.name}</div>
    </div>
    <div class="d-badges">
      <Badge color="#8E8E93" label={statusLabel(selectedTarget.status)} />
      {#if selectedTarget.owner}<Badge color="#007AFF" label={selectedTarget.owner} />{/if}
    </div>

    <div class="d-section">
      <div class="d-row">
        <span class="lbl">Owner</span>
        <select class="inline" value={selectedTarget.owner ?? ""} on:change={(e) => update({ owner: field(e) || undefined })}>
          <option value="">—</option>
          {#each $model.solution.members as m}
            <option value={m}>{m}</option>
          {/each}
        </select>
      </div>
      <div class="d-row">
        <span class="lbl">Status</span>
        <select value={selectedTarget.status} on:change={(e) => update({ status: field(e) })}>
          {#each TARGET_STATUSES as s}
            <option value={s}>{statusLabel(s)}</option>
          {/each}
        </select>
      </div>
      <div class="d-row">
        <span class="lbl">Start</span>
        <input type="date" value={selectedTarget.startDate ?? ""} on:change={(e) => update({ startDate: field(e) || undefined })} />
      </div>
      <div class="d-row">
        <span class="lbl">End</span>
        <input type="date" value={selectedTarget.endDate ?? ""} on:change={(e) => update({ endDate: field(e) || undefined })} />
      </div>
    </div>

    <div class="d-section">
      <div class="lbl">Dependencies</div>
      {#if depTargets().length === 0}
        <p class="muted">No other targets in this project.</p>
      {:else}
        <div class="deps">
          {#each depTargets() as d (d.id)}
            <label class="check">
              <input type="checkbox" checked={selectedTarget.dependencies.includes(d.id)} on:change={() => toggleDep(d.id)} />
              <span>{d.name}</span>
            </label>
          {/each}
        </div>
      {/if}
      {#if selectedTarget.dependencies.length}
        <div class="dep-pills">
          {#each selectedTarget.dependencies as d}
            <span class="dep-pill">↳ {depName(d)}</span>
          {/each}
        </div>
      {/if}
    </div>
  {:else if selectedRequirement}
    <div class="d-head">
      <div class="d-title">{selectedRequirement.title}</div>
    </div>
    <div class="d-badges">
      <Badge color={PRIORITY_COLORS[selectedRequirement.priority]} label={priorityLabel(selectedRequirement.priority)} />
      <Badge color={selectedRequirement.status === "pool" ? "#007AFF" : selectedRequirement.status === "triaged" ? "#34C759" : "#FF9F0A"} label={statusLabel(selectedRequirement.status)} />
    </div>

    <div class="d-section">
      <div class="d-row">
        <span class="lbl">Priority</span>
        <select value={selectedRequirement.priority} on:change={(e) => update({ priority: field(e) })}>
          {#each PRIORITIES as p}
            <option value={p}>{priorityLabel(p)}</option>
          {/each}
        </select>
      </div>
      <div class="d-row">
        <span class="lbl">Status</span>
        <select value={selectedRequirement.status} on:change={(e) => update({ status: field(e) })}>
          {#each REQUIREMENT_STATUSES as s}
            <option value={s}>{statusLabel(s)}</option>
          {/each}
        </select>
      </div>
      <div class="d-row">
        <span class="lbl">Source</span>
        <input class="inline" value={selectedRequirement.source ?? ""} placeholder="—" on:change={(e) => update({ source: field(e) || undefined })} />
      </div>
      <div class="d-row">
        <span class="lbl">Assign to</span>
        <select value={selectedRequirement.assignedProjectId ?? ""} on:change={(e) => update({ assignedProjectId: field(e) || undefined, status: "triaged" })}>
          <option value="">—</option>
          {#each $model.projects as p}
            <option value={p.id}>{p.name}</option>
          {/each}
        </select>
      </div>
    </div>

    {#if selectedRequirement.description}
      <div class="d-section">
        <div class="lbl">Description</div>
        <p class="desc">{selectedRequirement.description}</p>
      </div>
    {/if}
  {/if}

  {#if hasSelection}
    <div class="d-actions">
      <button class="act" on:click={edit}>Edit</button>
      <button class="act" on:click={openFile}>Open note</button>
      <button class="act danger" on:click={remove}>Delete</button>
      <span class="updated">Updated {fmtTs(updatedTs)}</span>
    </div>
  {/if}
</div>

<style>
  .detail {
    height: 100%;
    overflow-y: auto;
    padding: 20px 20px 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .placeholder {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--pm-muted, #8e8e93);
  }
  .placeholder p {
    margin: 0;
    font-size: 13px;
  }
  .d-head {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }
  .bar {
    width: 4px;
    align-self: stretch;
    border-radius: 3px;
    min-height: 18px;
  }
  .d-title {
    font-size: 16px;
    font-weight: 650;
    color: var(--pm-text, #1d1d1f);
    line-height: 1.3;
    letter-spacing: -0.2px;
  }
  .d-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: -6px;
  }
  .tick {
    width: 18px;
    height: 18px;
    border-radius: 6px;
    border: 1.5px solid var(--pm-border, rgba(0, 0, 0, 0.2));
    background: transparent;
    cursor: pointer;
    flex-shrink: 0;
    margin-top: 1px;
  }
  .tick.checked {
    background: #34c759;
    border-color: #34c759;
  }
  .d-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .lbl {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--pm-muted, #8e8e93);
    font-weight: 600;
  }
  .d-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .d-row .lbl {
    text-transform: none;
    letter-spacing: 0;
    font-size: 12.5px;
    font-weight: 500;
  }
  .val {
    display: flex;
    align-items: center;
    gap: 7px;
    flex: 1;
    justify-content: flex-end;
  }
  .val.muted {
    color: var(--pm-muted, #8e8e93);
    font-size: 12.5px;
  }
  .inline,
  .d-row select,
  .d-row input[type="date"] {
    font: inherit;
    font-size: 12.5px;
    color: var(--pm-text, #1d1d1f);
    padding: 6px 9px;
    border: 1px solid var(--pm-border, rgba(0, 0, 0, 0.1));
    border-radius: 8px;
    background: var(--pm-input, #fff);
    outline: none;
    text-align: right;
  }
  .inline {
    flex: 1;
    text-align: left;
    max-width: 160px;
  }
  .inline:focus,
  .d-row select:focus,
  .d-row input[type="date"]:focus {
    border-color: #007aff;
    box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.12);
  }
  .desc {
    margin: 0;
    font-size: 13px;
    line-height: 1.55;
    color: var(--pm-text, #1d1d1f);
    white-space: pre-wrap;
  }
  .muted {
    color: var(--pm-muted, #8e8e93);
    font-size: 12px;
    margin: 0;
  }
  .jira-list {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .jira-key {
    font-size: 11px;
    font-weight: 600;
    color: #0052cc;
    background: #e9f2ff;
    padding: 2px 7px;
    border-radius: 5px;
  }
  .deps {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12.5px;
    cursor: pointer;
  }
  .dep-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 4px;
  }
  .dep-pill {
    font-size: 11px;
    color: var(--pm-muted, #8e8e93);
    background: var(--pm-col, rgba(0, 0, 0, 0.04));
    padding: 2px 7px;
    border-radius: 5px;
  }
  .d-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: auto;
    padding-top: 14px;
    border-top: 1px solid var(--pm-border, rgba(0, 0, 0, 0.06));
  }
  .act {
    border: 1px solid var(--pm-border, rgba(0, 0, 0, 0.12));
    background: transparent;
    color: var(--pm-text, #1d1d1f);
    font-size: 12px;
    font-weight: 600;
    padding: 6px 12px;
    border-radius: 8px;
    cursor: pointer;
  }
  .act:hover {
    background: var(--pm-hover, rgba(0, 0, 0, 0.04));
  }
  .act.danger {
    color: #ff3b30;
    border-color: rgba(255, 59, 48, 0.3);
  }
  .act.danger:hover {
    background: rgba(255, 59, 48, 0.08);
  }
  .updated {
    margin-left: auto;
    font-size: 11px;
    color: var(--pm-muted, #8e8e93);
  }
</style>
