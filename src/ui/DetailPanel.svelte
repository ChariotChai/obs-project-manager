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
  import ConfirmModal from "./components/ConfirmModal.svelte";

  export let store: PmStore;
  const model = store.model;
  const selection = store.selection;

  // ---- Delete confirmation state ----
  // Holds the kind + display name of the entity pending deletion, or null.
  let pendingDelete: { kind: "project" | "target" | "task" | "requirement"; name: string } | null = null;

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

  function askRemove() {
    if (selectedProject) pendingDelete = { kind: "project", name: selectedProject.name };
    else if (selectedTarget) pendingDelete = { kind: "target", name: selectedTarget.name };
    else if (selectedTask) pendingDelete = { kind: "task", name: selectedTask.name };
    else if (selectedRequirement) pendingDelete = { kind: "requirement", name: selectedRequirement.title };
  }

  function doRemove() {
    if (!pendingDelete) return;
    if (selectedProject && pendingDelete.kind === "project") store.deleteProject(selectedProject.id);
    else if (selectedTarget && pendingDelete.kind === "target") store.deleteTarget(selectedTarget.id);
    else if (selectedTask && pendingDelete.kind === "task") store.deleteTask(selectedTask.id);
    else if (selectedRequirement && pendingDelete.kind === "requirement") store.deleteRequirement(selectedRequirement.id);
    pendingDelete = null;
  }

  function cancelRemove() {
    pendingDelete = null;
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

  // ---- Target Gantt + dependency graph (combined timeline + dep arrows) ----
  const DAY_PX = 22; // px per day
  const ROW_H = 48;  // px per row
  const LABEL_W = 168;

  let rowOrder: string[] = [];
  let dragId: string | null = null;
  let hoveredId: string | null = null;
  let dragMode: "reorder" | "dep" = "reorder";
  let dropTargetId: string | null = null;

  // Targets for the currently-selected project (memoised for the graph).
  $: pTargetsForGraph = selectedProject ? projectTargets(selectedProject.id) : [];

  // Keep row order in sync: preserve existing ordering, append new targets.
  $: rowOrder = (() => {
    const ids = pTargetsForGraph.map((t) => t.id);
    const kept = rowOrder.filter((id) => ids.includes(id));
    const added = ids.filter((id) => !kept.includes(id));
    return [...kept, ...added];
  })();

  function toTime(d: string): number {
    const t = new Date(d + "T00:00:00").getTime();
    return Number.isFinite(t) ? t : NaN;
  }
  function floorToDay(t: number): number {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  function ceilToDay(t: number): number {
    const d = new Date(t);
    d.setHours(24, 0, 0, 0);
    return d.getTime();
  }

  $: ganttRange = (() => {
    let min = Infinity;
    let max = -Infinity;
    if (selectedProject?.startDate) min = Math.min(min, toTime(selectedProject.startDate));
    if (selectedProject?.endDate) max = Math.max(max, toTime(selectedProject.endDate));
    for (const t of pTargetsForGraph) {
      if (t.startDate) { const s = toTime(t.startDate); if (Number.isFinite(s) && s < min) min = s; }
      if (t.endDate) { const e = toTime(t.endDate); if (Number.isFinite(e) && e > max) max = e; }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      const now = Date.now();
      min = now - 7 * 86400000;
      max = now + 21 * 86400000;
    }
    min = floorToDay(min) - 2 * 86400000;
    max = ceilToDay(max) + 2 * 86400000;
    return { min, max, days: Math.max(1, Math.round((max - min) / 86400000)) };
  })();

  $: ganttWidth = ganttRange.days * DAY_PX;

  // Per-target bar position { x, width } in pixels.
  $: barPositions = (() => {
    const map = new Map<string, { x: number; width: number }>();
    for (const t of pTargetsForGraph) {
      const s = t.startDate ? toTime(t.startDate) : t.endDate ? toTime(t.endDate) - 86400000 : ganttRange.min;
      const e = t.endDate ? toTime(t.endDate) : t.startDate ? toTime(t.startDate) + 86400000 : ganttRange.min + 7 * 86400000;
      const x = Math.max(0, ((s - ganttRange.min) / 86400000) * DAY_PX);
      const width = Math.max(DAY_PX * 3, ((e - s) / 86400000) * DAY_PX);
      map.set(t.id, { x, width });
    }
    return map;
  })();

  $: ganttMonths = (() => {
    const months: { label: string; left: number; width: number }[] = [];
    let cursor = ganttRange.min;
    while (cursor < ganttRange.max) {
      const d = new Date(cursor);
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
      const start = Math.max(cursor, monthStart);
      const end = Math.min(ganttRange.max, next);
      months.push({
        label: d.toLocaleDateString(undefined, { month: "short", year: "numeric" }),
        left: ((start - ganttRange.min) / 86400000) * DAY_PX,
        width: ((end - start) / 86400000) * DAY_PX,
      });
      cursor = next;
    }
    return months;
  })();

  $: todayLeft = ((floorToDay(Date.now()) - ganttRange.min) / 86400000) * DAY_PX;
  $: ganttHeight = rowOrder.length * ROW_H;

  // Dependency arrows: dep bar right-edge → dependent bar left-edge.
  $: ganttArrows = (() => {
    const arrows: { fromX: number; fromY: number; toX: number; toY: number; key: string }[] = [];
    for (const t of pTargetsForGraph) {
      const ti = rowOrder.indexOf(t.id);
      if (ti < 0) continue;
      const tp = barPositions.get(t.id);
      if (!tp) continue;
      for (const depId of t.dependencies) {
        const di = rowOrder.indexOf(depId);
        if (di < 0) continue;
        const dp = barPositions.get(depId);
        if (!dp) continue;
        arrows.push({
          fromX: dp.x + dp.width,
          fromY: di * ROW_H + ROW_H / 2,
          toX: tp.x,
          toY: ti * ROW_H + ROW_H / 2,
          key: depId + "->" + t.id,
        });
      }
    }
    return arrows;
  })();

  function onRowDragStart(e: DragEvent, id: string, mode: "reorder" | "dep" = "reorder") {
    dragId = id;
    dragMode = mode;
    e.dataTransfer?.setData("text/plain", id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = mode === "dep" ? "link" : "move";
  }
  function onRowDragOver(e: DragEvent, id: string) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = dragMode === "dep" ? "link" : "move";
    if (dragMode === "dep" && dragId !== id) {
      dropTargetId = id;
    } else {
      dropTargetId = null;
    }
  }
  function onRowDragLeave() {
    dropTargetId = null;
  }
  function onRowDrop(e: DragEvent, id: string) {
    e.preventDefault();
    const from = dragId ?? e.dataTransfer?.getData("text/plain") ?? null;
    dragId = null;
    dropTargetId = null;
    if (!from || from === id) return;
    if (dragMode === "dep") {
      const target = $model.targets.find((t) => t.id === id);
      if (target && !target.dependencies.includes(from)) {
        store.updateTarget(id, { dependencies: [...target.dependencies, from] });
      }
    } else {
      const fromIdx = rowOrder.indexOf(from);
      const toIdx = rowOrder.indexOf(id);
      if (fromIdx >= 0 && toIdx >= 0) {
        const next = [...rowOrder];
        next.splice(fromIdx, 1);
        next.splice(toIdx, 0, from);
        rowOrder = next;
      }
    }
  }

  /** Task stats for a target, used in the bar tooltip. */
  function targetStats(targetId: string): { total: number; done: number; blocked: number; inProgress: number } {
    const ts = $model.tasks.filter((k) => k.targetId === targetId);
    return {
      total: ts.length,
      done: ts.filter((k) => k.status === "done").length,
      blocked: ts.filter((k) => k.status === "blocked").length,
      inProgress: ts.filter((k) => k.status === "in-progress").length,
    };
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

        <div class="gantt">
          <div class="gantt-scroll">
            <div class="gantt-inner" style="width:{LABEL_W + ganttWidth}px">
              <div class="gantt-axis">
                <div class="axis-label" style="width:{LABEL_W}px">Target</div>
                <div class="axis-months" style="width:{ganttWidth}px">
                  {#each ganttMonths as m}
                    <div class="axis-month" style="left:{m.left}px;width:{m.width}px">{m.label}</div>
                  {/each}
                </div>
              </div>
              <div class="gantt-body" style="height:{ganttHeight}px">
                <div class="gantt-today" style="left:{LABEL_W + todayLeft}px"></div>
                <svg class="arrow-layer" style="left:{LABEL_W}px" width={ganttWidth} height={ganttHeight}>
                  <defs>
                    <marker id="gantt-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                      <path d="M0,0 L8,4 L0,8 z" fill="#007AFF" />
                    </marker>
                  </defs>
                  {#each ganttArrows as a (a.key)}
                    <path d="M {a.fromX},{a.fromY} C {a.fromX + 30},{a.fromY} {a.toX - 30},{a.toY} {a.toX},{a.toY}"
                          fill="none" stroke="#007AFF" stroke-width="2"
                          marker-end="url(#gantt-arrow)" opacity="0.75" />
                  {/each}
                </svg>
                {#each rowOrder as tid, i (tid)}
                  {@const t = pTargets.find((x) => x.id === tid)}
                  {@const pos = barPositions.get(tid)}
                  {@const stats = targetStats(tid)}
                  {@const isActive = $selection.kind === "target" && $selection.id === tid}
                  {#if t && pos}
                    <div class="g-row" style="top:{i * ROW_H}px;height:{ROW_H}px"
                         draggable="true"
                         on:dragstart={(e) => onRowDragStart(e, t.id, "reorder")}
                         on:dragover={(e) => onRowDragOver(e, t.id)}
                         on:dragleave={onRowDragLeave}
                         on:drop={(e) => onRowDrop(e, t.id)}
                         class:dragging={dragId === t.id}
                         class:drop-target={dropTargetId === t.id}
                    >
                      <div class="g-label" style="width:{LABEL_W}px" on:click={() => store.select("target", t.id)}>
                        <span class="g-drag" title="Drag to reorder">⠿</span>
                        <span class="g-drag-dep" title="Drag to create dependency" draggable="true"
                              on:dragstart={(e) => { e.stopPropagation(); onRowDragStart(e, t.id, "dep"); }}>◈</span>
                        <span class="g-dot" style="background:{STATUS_COLORS[t.status] ?? '#8E8E93'}"></span>
                        <span class="g-name" class:active={isActive}>{t.name}</span>
                      </div>
                      <div class="g-bar" style="left:{LABEL_W + pos.x}px;width:{pos.width}px"
                           class:active={isActive}
                           class:hovering={hoveredId === t.id}
                           class:drop-target={dropTargetId === t.id}
                           on:click={() => store.select("target", t.id)}
                           on:mouseenter={() => (hoveredId = t.id)}
                           on:mouseleave={() => (hoveredId = null)}
                      >
                        <div class="g-bar-fill" style="--c:{STATUS_COLORS[t.status] ?? '#8E8E93'}"></div>
                        <div class="g-bar-body">
                          <span class="g-bar-name">{t.name}</span>
                          {#if stats.total > 0}
                            <span class="g-bar-prog">{stats.done}/{stats.total}</span>
                            <span class="g-bar-track"><span class="g-bar-pct" style="width:{(stats.done / stats.total) * 100}%"></span></span>
                          {/if}
                        </div>
                        {#if hoveredId === t.id}
                          <div class="g-tooltip">
                            <div class="gt-head">
                              <span class="gt-dot" style="background:{STATUS_COLORS[t.status] ?? '#8E8E93'}"></span>
                              <span class="gt-name">{t.name}</span>
                            </div>
                            <div class="gt-row"><span>Status</span><b>{statusLabel(t.status)}</b></div>
                            {#if t.owner}<div class="gt-row"><span>Owner</span><b>{t.owner}</b></div>{/if}
                            <div class="gt-row"><span>Dates</span><b>{fmtDate(t.startDate)} → {fmtDate(t.endDate)}</b></div>
                            {#if stats.total > 0}
                              <div class="gt-row"><span>Tasks</span><b>{stats.done}/{stats.total} done</b></div>
                              {#if stats.blocked}<div class="gt-row"><span>Blocked</span><b>{stats.blocked}</b></div>{/if}
                              {#if stats.inProgress}<div class="gt-row"><span>In progress</span><b>{stats.inProgress}</b></div>{/if}
                            {/if}
                            {#if t.dependencies.length}
                              <div class="gt-deps">
                                <span>Depends on</span>
                                <div class="gt-dep-list">
                                  {#each t.dependencies as d}
                                    <span class="gt-dep">{targetName(d)}</span>
                                  {/each}
                                </div>
                              </div>
                            {/if}
                            {#if t.description}
                              <div class="gt-desc">{t.description}</div>
                            {/if}
                          </div>
                        {/if}
                      </div>
                    </div>
                  {/if}
                {/each}
              </div>
            </div>
          </div>
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
      <button class="act danger" on:click={askRemove}>Delete</button>
      <span class="updated">Updated {fmtTs(updatedTs)}</span>
    </div>
  {/if}
</div>

{#if pendingDelete}
  <ConfirmModal
    title="Delete {pendingDelete.kind}"
    message={`Delete "${pendingDelete.name}"? This cannot be undone.`}
    confirmLabel="Delete"
    danger={true}
    on:confirm={doRemove}
    on:cancel={cancelRemove}
  />
{/if}

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
  .gantt {
    background: var(--pm-col, rgba(0, 0, 0, 0.02));
    border-radius: 10px;
    border: 1px solid var(--pm-border, rgba(0, 0, 0, 0.06));
    overflow: hidden;
  }
  .gantt-scroll {
    overflow: auto;
    max-height: 360px;
  }
  .gantt-inner {
    position: relative;
  }
  .gantt-axis {
    position: sticky;
    top: 0;
    z-index: 6;
    display: flex;
    align-items: flex-end;
    height: 28px;
    background: var(--pm-surface, #fff);
    border-bottom: 1px solid var(--pm-border, rgba(0, 0, 0, 0.1));
  }
  .axis-label {
    position: sticky;
    left: 0;
    z-index: 7;
    background: var(--pm-surface, #fff);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--pm-muted, #8e8e93);
    font-weight: 600;
    padding: 0 10px;
    line-height: 28px;
    border-right: 1px solid var(--pm-border, rgba(0, 0, 0, 0.06));
  }
  .axis-months {
    position: relative;
    height: 28px;
  }
  .axis-month {
    position: absolute;
    top: 7px;
    font-size: 10.5px;
    font-weight: 600;
    color: var(--pm-muted, #8e8e93);
    padding-left: 5px;
    border-left: 1px solid var(--pm-border, rgba(0, 0, 0, 0.06));
    white-space: nowrap;
    overflow: hidden;
  }
  .gantt-body {
    position: relative;
  }
  .gantt-today {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #ff3b30;
    opacity: 0.4;
    z-index: 1;
    pointer-events: none;
  }
  .arrow-layer {
    position: absolute;
    top: 0;
    z-index: 1;
    pointer-events: none;
  }
  .g-row {
    position: absolute;
    left: 0;
    right: 0;
    border-bottom: 1px solid var(--pm-border, rgba(0, 0, 0, 0.04));
  }
  .g-row.dragging {
    opacity: 0.4;
  }
  .g-label {
    position: sticky;
    left: 0;
    z-index: 4;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 100%;
    background: var(--pm-surface, #fff);
    padding: 0 8px 0 4px;
    border-right: 1px solid var(--pm-border, rgba(0, 0, 0, 0.06));
    cursor: pointer;
    font-size: 12px;
    color: var(--pm-text, #1d1d1f);
  }
  .g-label:hover {
    background: var(--pm-hover, rgba(0, 0, 0, 0.03));
  }
  .g-drag {
    color: var(--pm-muted, #8e8e93);
    font-size: 12px;
    cursor: grab;
    flex-shrink: 0;
    line-height: 1;
    opacity: 0.4;
    transition: opacity 0.15s;
  }
  .g-label:hover .g-drag {
    opacity: 0.9;
  }
  .g-drag-dep {
    color: #007AFF;
    font-size: 10px;
    cursor: grab;
    flex-shrink: 0;
    line-height: 1;
    opacity: 0.3;
    transition: opacity 0.15s;
  }
  .g-label:hover .g-drag-dep {
    opacity: 0.8;
  }
  .g-row.drop-target {
    background: rgba(0, 122, 255, 0.05);
  }
  .g-bar.drop-target {
    outline: 2px dashed #007AFF;
    outline-offset: 2px;
  }
  .g-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .g-name {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500;
  }
  .g-name.active {
    color: var(--pm-accent, #007aff);
    font-weight: 600;
  }
  .g-bar {
    position: absolute;
    top: 6px;
    height: 36px;
    border-radius: 8px;
    overflow: visible;
    cursor: pointer;
    z-index: 2;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    transition: box-shadow 0.15s, transform 0.1s;
  }
  .g-bar:hover,
  .g-bar.hovering {
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.15);
    z-index: 5;
  }
  .g-bar.active {
    outline: 2px solid var(--pm-accent, #007aff);
    outline-offset: 1px;
  }
  .g-bar-fill {
    position: absolute;
    inset: 0;
    background: var(--c, #007aff);
    opacity: 0.22;
    border-radius: 8px;
  }
  .g-bar-body {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 100%;
    padding: 0 10px;
  }
  .g-bar-name {
    font-size: 11.5px;
    font-weight: 600;
    color: var(--pm-text, #1d1d1f);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .g-bar-prog {
    font-size: 10px;
    color: var(--pm-muted, #8e8e93);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
    margin-left: auto;
  }
  .g-bar-track {
    width: 36px;
    height: 4px;
    background: rgba(0, 0, 0, 0.1);
    border-radius: 2px;
    overflow: hidden;
    flex-shrink: 0;
  }
  .g-bar-pct {
    display: block;
    height: 100%;
    background: var(--c, #007aff);
    border-radius: 2px;
  }
  .g-tooltip {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 20;
    min-width: 200px;
    max-width: 280px;
    background: var(--pm-surface, #fff);
    border: 1px solid var(--pm-border, rgba(0, 0, 0, 0.12));
    border-radius: 10px;
    padding: 10px 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    font-size: 12px;
    pointer-events: none;
  }
  .gt-head {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 7px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--pm-border, rgba(0, 0, 0, 0.06));
  }
  .gt-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .gt-name {
    font-size: 13px;
    font-weight: 650;
    color: var(--pm-text, #1d1d1f);
  }
  .gt-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin: 3px 0;
    font-size: 11.5px;
  }
  .gt-row span {
    color: var(--pm-muted, #8e8e93);
  }
  .gt-row b {
    color: var(--pm-text, #1d1d1f);
    font-weight: 600;
    text-align: right;
  }
  .gt-deps {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid var(--pm-border, rgba(0, 0, 0, 0.06));
    font-size: 11.5px;
  }
  .gt-deps > span {
    color: var(--pm-muted, #8e8e93);
    display: block;
    margin-bottom: 3px;
  }
  .gt-dep-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .gt-dep {
    font-size: 10.5px;
    background: var(--pm-col, rgba(0, 0, 0, 0.05));
    padding: 2px 6px;
    border-radius: 5px;
    color: var(--pm-text, #1d1d1f);
  }
  .gt-desc {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid var(--pm-border, rgba(0, 0, 0, 0.06));
    font-size: 11.5px;
    color: var(--pm-text, #1d1d1f);
    line-height: 1.45;
    white-space: pre-wrap;
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
