<script lang="ts">
  import type PmStore from "../store";
  import { get } from "svelte/store";
  import Avatar from "./components/Avatar.svelte";
  import StatusDot from "./components/StatusDot.svelte";
  import { buildTree } from "../store";

  export let store: PmStore;

  const model = store.model;
  const selection = store.selection;

  let query = "";
  let expanded: Record<string, boolean> = {};

  $: tree = buildTree($model);

  $: filtered = tree
    .map((pn) => {
      const q = query.trim().toLowerCase();
      if (!q) return pn;
      const pMatch = pn.project.name.toLowerCase().includes(q);
      const targets = pn.targets
        .map((tn) => {
          const tMatch = tn.target.name.toLowerCase().includes(q);
          const tasks = tn.tasks.filter((t) => t.name.toLowerCase().includes(q));
          return tMatch || tasks.length ? { target: tn.target, tasks: tMatch ? tn.tasks : tasks } : null;
        })
        .filter(Boolean);
      return pMatch || targets.length ? { project: pn.project, targets: targets as any } : null;
    })
    .filter(Boolean) as ReturnType<typeof buildTree>;

  function toggle(id: string) {
    expanded[id] = !expanded[id];
    expanded = { ...expanded };
  }

  function count(kind: "targets" | "tasks", projId: string): number {
    if (kind === "targets") return $model.targets.filter((t) => t.projectId === projId).length;
    return $model.tasks.filter((t) => t.projectId === projId).length;
  }

  function projectDone(projectId: string): number {
    const ts = $model.tasks.filter((t) => t.projectId === projectId);
    if (!ts.length) return 0;
    return Math.round((ts.filter((t) => t.status === "done").length / ts.length) * 100);
  }

  export function newProject() {
    store.openEditor({ mode: "create", kind: "project" });
  }

  function sel(kind: any, id: string, e: MouseEvent) {
    e.stopPropagation();
    store.select(kind, id);
  }
</script>

<aside class="sidebar">
  <div class="search">
    <svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M11.5 10.5a4.5 4.5 0 1 0-1.06 1.06l2.5 2.5a.75.75 0 1 0 1.06-1.06zM10 6.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z"/></svg>
    <input placeholder="Search projects, targets, tasks" bind:value={query} />
  </div>

  <div class="section-head">
    <span>Projects</span>
    <button class="add" title="New project" on:click={newProject}>+</button>
  </div>

  <div class="tree">
    {#each filtered as node (node.project.id)}
      <div
        class="row project"
        class:active={$selection.kind === "project" && $selection.id === node.project.id}
        on:click={() => toggle(node.project.id)}
        on:dblclick={(e) => sel("project", node.project.id, e)}
        role="treeitem"
      >
        <span class="caret" class:open={expanded[node.project.id]}>▸</span>
        <span class="bar" style="background:{node.project.color}"></span>
        <span class="label">{node.project.name}</span>
        <StatusDot status={node.project.status} size={7} />
        {#if node.targets.length}
          <span class="count">{projectDone(node.project.id)}%</span>
        {/if}
      </div>

      {#if expanded[node.project.id]}
        {#each node.targets as tn (tn.target.id)}
          <div
            class="row target"
            class:active={$selection.kind === "target" && $selection.id === tn.target.id}
            on:click={() => toggle(tn.target.id)}
            on:dblclick={(e) => sel("target", tn.target.id, e)}
          >
            <span class="indent"></span>
            <span class="caret" class:open={expanded[tn.target.id]}>▸</span>
            <span class="label">{tn.target.name}</span>
            <StatusDot status={tn.target.status} size={6} />
            <span class="count">{tn.tasks.length}</span>
          </div>

          {#if expanded[tn.target.id]}
            {#each tn.tasks as task (task.id)}
              <div
                class="row task"
                class:active={$selection.kind === "task" && $selection.id === task.id}
                class:done={task.status === "done"}
                on:click={(e) => sel("task", task.id, e)}
              >
                <span class="indent2"></span>
                <span class="tasktick" class:checked={task.status === "done"}></span>
                <span class="label">{task.name}</span>
                {#if task.owner}
                  <Avatar name={task.owner} size={16} />
                {/if}
              </div>
            {/each}
            <button
              class="add-sub task"
              on:click={() => store.openEditor({ mode: "create", kind: "task", targetId: tn.target.id })}
            >+ Task</button>
          {/if}
        {/each}
        <button
          class="add-sub"
          on:click={() => store.openEditor({ mode: "create", kind: "target", projectId: node.project.id })}
        >+ Target</button>
      {/if}
    {:else}
      <div class="empty">
        <p>No projects yet</p>
        <button class="add" on:click={newProject}>Create project</button>
      </div>
    {/each}
  </div>

  <div class="pool" on:click={() => store.setTab("requirements")} class:active={$model.requirements.filter((r) => r.status === "pool").length > 0}>
    <svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v2A1.5 1.5 0 0 1 12.5 7h-9A1.5 1.5 0 0 1 2 5.5zm0 7A1.5 1.5 0 0 1 3.5 9h9A1.5 1.5 0 0 1 14 10.5v2A1.5 1.5 0 0 1 12.5 14h-9A1.5 1.5 0 0 1 2 12.5z"/></svg>
    <div class="pool-text">
      <div class="pool-title">Requirement pool</div>
      <div class="pool-sub">{$model.requirements.filter((r) => r.status === "pool").length} awaiting triage</div>
    </div>
  </div>
</aside>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    height: 100%;
    border-right: 1px solid var(--pm-border, rgba(0, 0, 0, 0.08));
    background: var(--pm-sidebar, #fbfbfd);
  }
  .search {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 12px 12px 8px;
    padding: 7px 9px;
    background: var(--pm-input, #fff);
    border: 1px solid var(--pm-border, rgba(0, 0, 0, 0.1));
    border-radius: 9px;
    color: var(--pm-muted, #8e8e93);
  }
  .search input {
    border: none;
    background: transparent;
    outline: none;
    font: inherit;
    font-size: 12.5px;
    width: 100%;
    color: var(--pm-text, #1d1d1f);
  }
  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px 4px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--pm-muted, #8e8e93);
    font-weight: 600;
  }
  .add {
    border: none;
    background: transparent;
    color: var(--pm-accent, #007aff);
    font-size: 16px;
    cursor: pointer;
    width: 22px;
    height: 22px;
    border-radius: 7px;
    line-height: 1;
  }
  .add:hover {
    background: var(--pm-hover, rgba(0, 0, 0, 0.05));
  }
  .tree {
    flex: 1;
    overflow-y: auto;
    padding: 2px 8px 8px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 6px 8px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    color: var(--pm-text, #1d1d1f);
    user-select: none;
  }
  .row:hover {
    background: var(--pm-hover, rgba(0, 0, 0, 0.04));
  }
  .row.active {
    background: color-mix(in srgb, var(--pm-accent, #007aff) 12%, transparent);
    color: var(--pm-accent, #007aff);
  }
  .caret {
    font-size: 10px;
    color: var(--pm-muted, #8e8e93);
    transition: transform 0.15s;
    width: 10px;
    text-align: center;
  }
  .caret.open {
    transform: rotate(90deg);
  }
  .bar {
    width: 3px;
    height: 14px;
    border-radius: 3px;
    flex-shrink: 0;
  }
  .label {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row.task.done .label {
    color: var(--pm-muted, #8e8e93);
    text-decoration: line-through;
  }
  .count {
    font-size: 11px;
    color: var(--pm-muted, #8e8e93);
    font-variant-numeric: tabular-nums;
    background: var(--pm-track, rgba(0, 0, 0, 0.05));
    padding: 1px 6px;
    border-radius: 999px;
  }
  .row.active .count {
    background: color-mix(in srgb, var(--pm-accent, #007aff) 16%, transparent);
  }
  .indent {
    width: 16px;
    flex-shrink: 0;
  }
  .indent2 {
    width: 38px;
    flex-shrink: 0;
  }
  .tasktick {
    width: 13px;
    height: 13px;
    border-radius: 4px;
    border: 1.5px solid var(--pm-border, rgba(0, 0, 0, 0.2));
    flex-shrink: 0;
  }
  .tasktick.checked {
    background: #34c759;
    border-color: #34c759;
  }
  .add-sub {
    border: none;
    background: transparent;
    color: var(--pm-muted, #8e8e93);
    font-size: 11.5px;
    padding: 5px 12px 5px 38px;
    cursor: pointer;
    text-align: left;
    width: 100%;
    border-radius: 7px;
  }
  .add-sub:hover {
    color: var(--pm-accent, #007aff);
    background: var(--pm-hover, rgba(0, 0, 0, 0.04));
  }
  .add-sub {
    margin-left: 16px;
  }
  .add-sub.task {
    margin-left: 38px;
  }
  .empty {
    text-align: center;
    padding: 28px 16px;
    color: var(--pm-muted, #8e8e93);
  }
  .empty p {
    margin: 0 0 10px;
    font-size: 13px;
  }
  .pool {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    cursor: pointer;
    border-top: 1px solid var(--pm-border, rgba(0, 0, 0, 0.08));
    color: var(--pm-text, #1d1d1f);
  }
  .pool:hover {
    background: var(--pm-hover, rgba(0, 0, 0, 0.04));
  }
  .pool.active {
    color: var(--pm-accent, #007aff);
  }
  .pool-title {
    font-size: 13px;
    font-weight: 600;
  }
  .pool-sub {
    font-size: 11px;
    color: var(--pm-muted, #8e8e93);
  }
</style>
