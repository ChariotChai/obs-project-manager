<script lang="ts">
  import type PmStore from "../store";
  import type { Project, Target, Task, Requirement, Priority } from "../types";
  import {
    PROJECT_STATUSES,
    TARGET_STATUSES,
    TASK_STATUSES,
    REQUIREMENT_STATUSES,
    PRIORITIES,
    effectiveStatuses,
    statusLabel,
    priorityLabel,
    PRIORITY_COLORS,
    STATUS_COLORS,
  } from "../constants";
  import Avatar from "./components/Avatar.svelte";
  import Progress from "./components/Progress.svelte";
  import Badge from "./components/Badge.svelte";
  import StatusDot from "./components/StatusDot.svelte";

  export let store: PmStore;
  const model = store.model;
  const selection = store.selection;

  $: sel = $selection;
  $: cfg = $model.solution.statusConfig;
  $: projectStatusList = effectiveStatuses(cfg, "project");
  $: targetStatusList = effectiveStatuses(cfg, "target");
  $: taskStatusList = effectiveStatuses(cfg, "task");
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

  function projectTargets(id: string): Target[] {
    return $model.targets
      .filter((t) => t.projectId === id)
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }

  function targetTaskStats(targetId: string) {
    const ts = $model.tasks.filter((t) => t.targetId === targetId);
    const byStatus: Record<string, number> = {};
    for (const t of ts) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    const byPriority: Record<string, number> = {};
    for (const t of ts) byPriority[t.priority] = (byPriority[t.priority] ?? 0) + 1;
    return {
      total: ts.length,
      done: ts.filter((t) => t.status === "done").length,
      byStatus,
      byPriority,
    };
  }

  /** Compute a layered layout for the target dependency graph. */
  function targetGraphLayout(targets: Target[]) {
    const byId = new Map(targets.map((t) => [t.id, t]));
    const layers = new Map<string, number>();
    for (const t of targets) layers.set(t.id, 0);
    let changed = true;
    let guard = 0;
    while (changed && guard++ < targets.length + 5) {
      changed = false;
      for (const t of targets) {
        let maxDep = -1;
        for (const d of t.dependencies) {
          if (layers.has(d)) maxDep = Math.max(maxDep, layers.get(d)!);
        }
        const want = maxDep + 1;
        if (want > (layers.get(t.id) ?? 0)) {
          layers.set(t.id, want);
          changed = true;
        }
      }
    }
    // group by layer
    const byLayer = new Map<number, Target[]>();
    for (const t of targets) {
      const l = layers.get(t.id) ?? 0;
      if (!byLayer.has(l)) byLayer.set(l, []);
      byLayer.get(l)!.push(t);
    }
    const layerCount = Math.max(1, byLayer.size);
    const nodeW = 150;
    const nodeH = 44;
    const colGap = 70;
    const rowGap = 18;
    const positions = new Map<string, { x: number; y: number; layer: number }>();
    let maxRows = 1;
    for (let l = 0; l < layerCount; l++) {
      const nodes = byLayer.get(l) ?? [];
      maxRows = Math.max(maxRows, nodes.length);
    }
    for (let l = 0; l < layerCount; l++) {
      const nodes = byLayer.get(l) ?? [];
      const colRows = Math.max(maxRows, nodes.length);
      nodes.forEach((t, i) => {
        const x = l * (nodeW + colGap);
        // centre each column vertically
        const totalH = colRows * nodeH + (colRows - 1) * rowGap;
        const startY = 0;
        const y = startY + i * (nodeH + rowGap) + (totalH - (nodes.length * nodeH + (nodes.length - 1) * rowGap)) / 2;
        positions.set(t.id, { x, y, layer: l });
      });
    }
    const edges: { from: string; to: string; fromX: number; fromY: number; toX: number; toY: number }[] = [];
    for (const t of targets) {
      const fromPos = positions.get(t.id);
      if (!fromPos) continue;
      for (const depId of t.dependencies) {
        const toPos = positions.get(depId);
        if (!toPos) continue;
        edges.push({
          from: depId,
          to: t.id,
          fromX: toPos.x + nodeW,
          fromY: toPos.y + nodeH / 2,
          toX: fromPos.x,
          toY: fromPos.y + nodeH / 2,
        });
      }
    }
    const width = layerCount * nodeW + (layerCount - 1) * colGap;
    const height = maxRows * nodeH + (maxRows - 1) * rowGap;
    return { positions, edges, width: Math.max(width, 200), height: Math.max(height, nodeH), nodeW, nodeH };
  }

  function targetName(id: string): string {
    return $model.targets.find((t) => t.id === id)?.name ?? id;
  }

  function addTargetToProject(projectId: string) {
    store.openEditor({ mode: "create", kind: "target", projectId });
  }

  function addTaskToTarget(targetId: string) {
    store.openEditor({ mode: "create", kind: "task", targetId });
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
  {:else}
    <button class="back" on:click={() => store.select(null, null)} title="Back to dashboard">
      <svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M10.5 13.5a.75.75 0 0 1-1.06 0L5.5 9.56a1.5 1.5 0 0 1 0-2.12l3.94-3.94a.75.75 0 1 1 1.06 1.06L6.56 8.5l3.94 3.94a.75.75 0 0 1 0 1.06z"/></svg>
      <span>Back</span>
    </button>
  {/if}

  {#if selectedTask}
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
          {#each taskStatusList as s}
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
          {#each projectStatusList as s}
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

    {@const pTargets = projectTargets(selectedProject.id)}
    {@const pGraph = targetGraphLayout(pTargets)}
    {@const pTaskByTarget = new Map(pTargets.map((t) => [t.id, $model.tasks.filter((k) => k.targetId === t.id)]))}
    <div class="d-section insight">
      <div class="insight-head">
        <span class="lbl">Targets</span>
        <button class="add-btn" on:click={() => addTargetToProject(selectedProject.id)}>+ Target</button>
      </div>
      {#if pTargets.length === 0}
        <p class="muted">No targets yet. Create one to start breaking the project down.</p>
      {:else}
        <div class="stat-row">
          {#each targetStatusList as s}
            {@const c = pTargets.filter((t) => t.status === s).length}
            {#if c}
              <span class="stat-pill" style="--c:{STATUS_COLORS[s] ?? '#8E8E93'}">
                <span class="dot"></span>{statusLabel(s)} <b>{c}</b>
              </span>
            {/if}
          {/each}
        </div>

        {#if pTargets.length > 1}
          <div class="graph-wrap">
            <svg viewBox="0 0 {pGraph.width} {pGraph.height}" preserveAspectRatio="xMidYMid meet" class="dep-graph">
              <defs>
                <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 z" fill="var(--pm-muted, #8e8e93)" />
                </marker>
              </defs>
              {#each pGraph.edges as e}
                <path d="M {e.fromX},{e.fromY} C {(e.fromX + e.toX) / 2},{e.fromY} {(e.fromX + e.toX) / 2},{e.toY} {e.toX},{e.toY}"
                      fill="none" stroke="var(--pm-muted, #8e8e93)" stroke-width="1.5" marker-end="url(#arrowhead)" opacity="0.7" />
              {/each}
              {#each pTargets as t (t.id)}
                {@const pos = pGraph.positions.get(t.id)}
                {#if pos}
                  <g class="gnode" on:click={() => sel("target", t.id)}>
                    <rect x={pos.x} y={pos.y} width={pGraph.nodeW} height={pGraph.nodeH} rx="9"
                          fill="var(--pm-surface, #fff)" stroke="var(--pm-border, rgba(0,0,0,0.12))"
                          class:gactive={$selection.kind === "target" && $selection.id === t.id} />
                    <circle cx={pos.x + 9} cy={pos.y + pGraph.nodeH / 2} r="4" fill={STATUS_COLORS[t.status] ?? '#8E8E93'} />
                    <text x={pos.x + 20} y={pos.y + 18} class="gname">{t.name}</text>
                    <text x={pos.x + 20} y={pos.y + 33} class="gsub">{statusLabel(t.status)}</text>
                  </g>
                {/if}
              {/each}
            </svg>
          </div>
        {/if}

        <div class="target-list">
          {#each pTargets as t (t.id)}
            {@const tTasks = pTaskByTarget.get(t.id) ?? []}
            {@const tDone = tTasks.filter((k) => k.status === "done").length}
            <button class="target-row" on:click={() => sel("target", t.id)} class:active={$selection.kind === "target" && $selection.id === t.id}>
              <span class="bar" style="background:{STATUS_COLORS[t.status] ?? '#8E8E93'}"></span>
              <span class="t-name">{t.name}</span>
              <StatusDot status={t.status} size={7} />
              <span class="t-count">{tDone}/{tTasks.length}</span>
            </button>
          {/each}
        </div>
      {/if}
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
          {#each targetStatusList as s}
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

    {@const tTasks = $model.tasks.filter((k) => k.targetId === selectedTarget.id)}
    {@const tStats = targetTaskStats(selectedTarget.id)}
    <div class="d-section insight">
      <div class="insight-head">
        <span class="lbl">Tasks</span>
        <button class="add-btn" on:click={() => addTaskToTarget(selectedTarget.id)}>+ Task</button>
      </div>
      {#if tTasks.length === 0}
        <p class="muted">No tasks yet. Add one to start tracking work.</p>
      {:else}
        <div class="t-progress">
          <Progress value={tStats.total ? (tStats.done / tStats.total) * 100 : 0} label={`${tStats.done}/${tStats.total}`} />
        </div>
        <div class="stat-row">
          {#each taskStatusList as s}
            {@const c = tStats.byStatus[s] ?? 0}
            {#if c}
              <span class="stat-pill" style="--c:{STATUS_COLORS[s] ?? '#8E8E93'}">
                <span class="dot"></span>{statusLabel(s)} <b>{c}</b>
              </span>
            {/if}
          {/each}
        </div>
        <div class="stat-row">
          {#each PRIORITIES as p}
            {@const c = tStats.byPriority[p] ?? 0}
            {#if c}
              <span class="stat-pill" style="--c:{PRIORITY_COLORS[p]}">
                <span class="dot"></span>{priorityLabel(p)} <b>{c}</b>
              </span>
            {/if}
          {/each}
        </div>
        <div class="task-list">
          {#each tTasks as k (k.id)}
            <button class="task-row" on:click={() => sel("task", k.id)} class:active={$selection.kind === "task" && $selection.id === k.id} class:done={k.status === "done"}>
              <span class="ttick" class:checked={k.status === "done"}></span>
              <span class="tk-name">{k.name}</span>
              {#if k.owner}
                <Avatar name={k.owner} size={16} />
              {/if}
              <span class="prio-dot" style="background:{PRIORITY_COLORS[k.priority]}" title={priorityLabel(k.priority)}></span>
            </button>
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
  .back {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: none;
    background: transparent;
    color: var(--pm-accent, #007aff);
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    padding: 4px 8px 4px 4px;
    border-radius: 7px;
    cursor: pointer;
    margin: -4px 0 -4px -4px;
  }
  .back:hover {
    background: var(--pm-hover, rgba(0, 0, 0, 0.05));
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
  .insight-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .add-btn {
    border: 1px solid var(--pm-border, rgba(0, 0, 0, 0.12));
    background: transparent;
    color: var(--pm-accent, #007aff);
    font: inherit;
    font-size: 11.5px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 8px;
    cursor: pointer;
  }
  .add-btn:hover {
    background: var(--pm-hover, rgba(0, 0, 0, 0.04));
  }
  .stat-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .stat-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: var(--pm-text, #1d1d1f);
    background: var(--pm-col, rgba(0, 0, 0, 0.04));
    padding: 3px 8px;
    border-radius: 999px;
  }
  .stat-pill .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--c, #8e8e93);
  }
  .stat-pill b {
    font-weight: 600;
    color: var(--pm-muted, #8e8e93);
  }
  .graph-wrap {
    overflow-x: auto;
    background: var(--pm-col, rgba(0, 0, 0, 0.02));
    border-radius: 10px;
    padding: 10px;
    border: 1px solid var(--pm-border, rgba(0, 0, 0, 0.06));
  }
  .dep-graph {
    width: 100%;
    min-height: 80px;
    max-height: 280px;
    display: block;
  }
  .gnode {
    cursor: pointer;
  }
  .gnode rect {
    transition: stroke 0.15s, filter 0.15s;
  }
  .gnode:hover rect {
    stroke: var(--pm-accent, #007aff);
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.08));
  }
  .gnode rect.gactive {
    stroke: var(--pm-accent, #007aff);
    stroke-width: 2;
  }
  .gname {
    font-size: 10px;
    font-weight: 600;
    fill: var(--pm-text, #1d1d1f);
  }
  .gsub {
    font-size: 9px;
    fill: var(--pm-muted, #8e8e93);
  }
  .target-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .target-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    text-align: left;
    border: none;
    background: transparent;
    padding: 7px 8px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 12.5px;
    color: var(--pm-text, #1d1d1f);
  }
  .target-row:hover {
    background: var(--pm-hover, rgba(0, 0, 0, 0.04));
  }
  .target-row.active {
    background: color-mix(in srgb, var(--pm-accent, #007aff) 12%, transparent);
    color: var(--pm-accent, #007aff);
  }
  .target-row .bar {
    width: 3px;
    height: 16px;
    border-radius: 3px;
    flex-shrink: 0;
  }
  .target-row .t-name {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .target-row .t-count {
    font-size: 11px;
    color: var(--pm-muted, #8e8e93);
    font-variant-numeric: tabular-nums;
  }
  .t-progress {
    margin: -2px 0 2px;
  }
  .task-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .task-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    text-align: left;
    border: none;
    background: transparent;
    padding: 6px 8px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 12.5px;
    color: var(--pm-text, #1d1d1f);
  }
  .task-row:hover {
    background: var(--pm-hover, rgba(0, 0, 0, 0.04));
  }
  .task-row.active {
    background: color-mix(in srgb, var(--pm-accent, #007aff) 12%, transparent);
    color: var(--pm-accent, #007aff);
  }
  .task-row.done .tk-name {
    color: var(--pm-muted, #8e8e93);
    text-decoration: line-through;
  }
  .ttick {
    width: 13px;
    height: 13px;
    border-radius: 4px;
    border: 1.5px solid var(--pm-border, rgba(0, 0, 0, 0.2));
    flex-shrink: 0;
  }
  .ttick.checked {
    background: #34c759;
    border-color: #34c759;
  }
  .tk-name {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .prio-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
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
