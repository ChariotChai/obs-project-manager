<script lang="ts">
  import type PmStore from "../store";
  import type { Task, TaskStatus } from "../types";
  import { TASK_STATUSES, statusLabel, PRIORITY_COLORS, priorityLabel } from "../constants";
  import Avatar from "./components/Avatar.svelte";

  export let store: PmStore;
  const model = store.model;
  const selection = store.selection;

  let projectFilter = "all";
  let ownerFilter = "all";
  let draggingId: string | null = null;

  $: owners = [...new Set($model.tasks.map((t) => t.owner).filter(Boolean))] as string[];

  $: filtered = $model.tasks.filter((t) => {
    if (projectFilter !== "all" && t.projectId !== projectFilter) return false;
    if (ownerFilter !== "all" && t.owner !== ownerFilter) return false;
    return true;
  });

  function tasksByStatus(status: TaskStatus): Task[] {
    return filtered.filter((t) => t.status === status);
  }
  function targetName(id: string): string {
    return $model.targets.find((t) => t.id === id)?.name ?? "—";
  }
  function isOverdue(t: Task): boolean {
    return !!t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "done";
  }
  function fmtDate(d?: string) {
    if (!d) return "";
    try {
      return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch {
      return d;
    }
  }

  function onDragStart(e: DragEvent, t: Task) {
    draggingId = t.id;
    e.dataTransfer?.setData("text/plain", t.id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  }
  function onDrop(e: DragEvent, status: TaskStatus) {
    e.preventDefault();
    const id = e.dataTransfer?.getData("text/plain") ?? draggingId;
    draggingId = null;
    if (id) store.updateTask(id, { status });
  }
  function onDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  }
</script>

<div class="board">
  <div class="board-head">
    <h2>Board</h2>
    <div class="filters">
      <select bind:value={projectFilter}>
        <option value="all">All projects</option>
        {#each $model.projects as p}
          <option value={p.id}>{p.name}</option>
        {/each}
      </select>
      <select bind:value={ownerFilter}>
        <option value="all">All owners</option>
        {#each owners as o}
          <option value={o}>{o}</option>
        {/each}
      </select>
    </div>
  </div>

  <div class="cols">
    {#each TASK_STATUSES as status}
      <div
        class="col"
        on:dragover={onDragOver}
        on:drop={(e) => onDrop(e, status)}
      >
        <div class="col-head">
          <span class="dot" style="background:{PRIORITY_COLORS[status === 'todo' ? 'low' : status === 'done' ? 'medium' : 'urgent'] ?? '#8E8E93'}"></span>
          <span>{statusLabel(status)}</span>
          <span class="count">{tasksByStatus(status).length}</span>
        </div>
        <div class="col-body">
          {#each tasksByStatus(status) as t (t.id)}
            <div
              class="card"
              draggable="true"
              on:dragstart={(e) => onDragStart(e, t)}
              on:click={() => store.select("task", t.id)}
              class:active={$selection.kind === "task" && $selection.id === t.id}
            >
              <div class="card-top">
                <span class="t-name">{t.name}</span>
              </div>
              <div class="card-meta">
                <span class="t-target">{targetName(t.targetId)}</span>
                <span class="prio" style="--c:{PRIORITY_COLORS[t.priority]}">{priorityLabel(t.priority)}</span>
              </div>
              {#if t.jiraStories.length}
                <div class="jira">
                  {#each t.jiraStories as j}
                    <span class="jira-key">{j.key}</span>
                  {/each}
                </div>
              {/if}
              <div class="card-foot">
                {#if t.owner}
                  <Avatar name={t.owner} size={20} />
                {/if}
                {#if t.dueDate}
                  <span class="due" class:over={isOverdue(t)}>{fmtDate(t.dueDate)}</span>
                {/if}
              </div>
            </div>
          {/each}
          {#if tasksByStatus(status).length === 0}
            <div class="empty">Drop tasks here</div>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .board {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .board-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 22px 12px;
  }
  .board-head h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
  .filters {
    display: flex;
    gap: 8px;
  }
  .filters select {
    font: inherit;
    font-size: 12px;
    padding: 6px 10px;
    border: 1px solid var(--pm-border, rgba(0, 0, 0, 0.1));
    border-radius: 8px;
    background: var(--pm-input, #fff);
    color: var(--pm-text, #1d1d1f);
    outline: none;
  }
  .cols {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(5, minmax(220px, 1fr));
    gap: 12px;
    padding: 0 22px 22px;
    overflow-x: auto;
  }
  .col {
    background: var(--pm-col, rgba(0, 0, 0, 0.025));
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .col-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px;
    font-size: 13px;
    font-weight: 600;
    color: var(--pm-text, #1d1d1f);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .count {
    margin-left: auto;
    font-size: 11px;
    color: var(--pm-muted, #8e8e93);
    background: var(--pm-surface, #fff);
    padding: 1px 7px;
    border-radius: 999px;
    font-weight: 600;
  }
  .col-body {
    flex: 1;
    overflow-y: auto;
    padding: 4px 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .card {
    background: var(--pm-surface, #fff);
    border: 1px solid var(--pm-border, rgba(0, 0, 0, 0.07));
    border-radius: 11px;
    padding: 11px 12px;
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
    transition: transform 0.12s, box-shadow 0.12s;
  }
  .card:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }
  .card.active {
    border-color: var(--pm-accent, #007aff);
    box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.15);
  }
  .t-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--pm-text, #1d1d1f);
    line-height: 1.3;
  }
  .card-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 6px;
    gap: 6px;
  }
  .t-target {
    font-size: 11px;
    color: var(--pm-muted, #8e8e93);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .prio {
    font-size: 10px;
    font-weight: 600;
    color: var(--c);
    padding: 1px 6px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--c) 14%, transparent);
    white-space: nowrap;
  }
  .jira {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 8px;
  }
  .jira-key {
    font-size: 10px;
    font-weight: 600;
    color: #0052cc;
    background: #e9f2ff;
    padding: 1px 6px;
    border-radius: 4px;
  }
  .card-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 9px;
  }
  .due {
    font-size: 11px;
    color: var(--pm-muted, #8e8e93);
    font-variant-numeric: tabular-nums;
  }
  .due.over {
    color: #ff3b30;
    font-weight: 600;
  }
  .empty {
    text-align: center;
    color: var(--pm-muted, #8e8e93);
    font-size: 11px;
    padding: 18px 8px;
    border: 1.5px dashed var(--pm-border, rgba(0, 0, 0, 0.1));
    border-radius: 10px;
    margin-top: 4px;
  }
</style>
