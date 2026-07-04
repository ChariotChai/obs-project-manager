<script lang="ts">
  import type PmStore from "../store";
  import type { BoardType } from "../store";
  import Avatar from "./components/Avatar.svelte";
  import StatusDot from "./components/StatusDot.svelte";
  import { buildTree } from "../store";

  export let store: PmStore;

  const model = store.model;
  const selection = store.selection;
  const tab = store.tab;
  const boards = store.boards;
  const activeBoardId = store.activeBoardId;

  let query = "";
  let expanded: Record<string, boolean> = {};

  // Inline "add board" form state
  let addingBoard = false;
  let newBoardName = "";
  let newBoardType: BoardType = "board";

  const BOARD_TYPES: { value: BoardType; label: string }[] = [
    { value: "overview", label: "Statistics" },
    { value: "timeline", label: "Timeline" },
    { value: "board", label: "Board" },
    { value: "query", label: "Query" },
  ];

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

  function toggle(id: string, e: MouseEvent) {
    e.stopPropagation();
    expanded[id] = !expanded[id];
    expanded = { ...expanded };
  }

  function projectDone(projectId: string): number {
    const ts = $model.tasks.filter((t) => t.projectId === projectId);
    if (!ts.length) return 0;
    return Math.round((ts.filter((t) => t.status === "done").length / ts.length) * 100);
  }

  function sel(kind: any, id: string) {
    store.select(kind, id);
  }

  function openReqPool() {
    store.select(null, null);
    store.setTab("requirements");
  }

  function confirmAddBoard() {
    const name = newBoardName.trim();
    if (!name) {
      addingBoard = false;
      return;
    }
    store.addBoard(name, newBoardType);
    newBoardName = "";
    newBoardType = "board";
    addingBoard = false;
  }

  function cancelAddBoard() {
    addingBoard = false;
    newBoardName = "";
    newBoardType = "board";
  }
</script>

<aside class="sidebar">
  <div class="search">
    <svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M11.5 10.5a4.5 4.5 0 1 0-1.06 1.06l2.5 2.5a.75.75 0 1 0 1.06-1.06zM10 6.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z"/></svg>
    <input placeholder="Search projects, targets, tasks" bind:value={query} />
  </div>

  <div class="scroll">
    <!-- Section 1: Insight (customizable boards) -->
    <section class="sec">
      <div class="section-head">
        <span>Insight</span>
        <button class="add" title="Add board" on:click={() => (addingBoard = true)}>+</button>
      </div>

      {#if addingBoard}
        <div class="add-form">
          <input class="add-input" placeholder="Board name" bind:value={newBoardName} on:keydown={(e) => e.key === "Enter" && confirmAddBoard()} />
          <select bind:value={newBoardType}>
            {#each BOARD_TYPES as bt}
              <option value={bt.value}>{bt.label}</option>
            {/each}
          </select>
          <div class="add-form-actions">
            <button class="mini primary" on:click={confirmAddBoard}>Add</button>
            <button class="mini" on:click={cancelAddBoard}>Cancel</button>
          </div>
        </div>
      {/if}

      <div class="board-list">
        {#each $boards as b (b.id)}
          <div
            class="row board"
            class:active={$tab !== "requirements" && $activeBoardId === b.id}
            on:click={() => store.openBoard(b.id)}
            role="button"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" class="ic"><path fill="currentColor" d="M2 3.5A1.5 1.5 0 0 1 3.5 2h3A1.5 1.5 0 0 1 8 3.5v3A1.5 1.5 0 0 1 6.5 8h-3A1.5 1.5 0 0 1 2 6.5zm7 0A1.5 1.5 0 0 1 10.5 2h3A1.5 1.5 0 0 1 15 3.5v3A1.5 1.5 0 0 1 13.5 8h-3A1.5 1.5 0 0 1 9 6.5zm-7 7A1.5 1.5 0 0 1 3.5 9h3A1.5 1.5 0 0 1 8 10.5v3A1.5 1.5 0 0 1 6.5 15h-3A1.5 1.5 0 0 1 2 13.5zm7 0A1.5 1.5 0 0 1 10.5 9h3A1.5 1.5 0 0 1 15 10.5v3A1.5 1.5 0 0 1 13.5 15h-3A1.5 1.5 0 0 1 9 13.5z"/></svg>
            <span class="label">{b.name}</span>
            <button class="rm" title="Remove board" on:click={(e) => { e.stopPropagation(); store.removeBoard(b.id); }}>×</button>
          </div>
        {:else}
          <div class="empty-sm">No boards. Add one with +.</div>
        {/each}
      </div>
    </section>

    <!-- Section 2: Projects tree -->
    <section class="sec">
      <div class="section-head">
        <span>Projects</span>
        <button class="add" title="New project" on:click={() => store.openEditor({ mode: "create", kind: "project" })}>+</button>
      </div>

      <div class="tree">
        {#each filtered as node (node.project.id)}
          <div
            class="row project"
            class:active={$selection.kind === "project" && $selection.id === node.project.id}
            on:click={() => sel("project", node.project.id)}
            role="treeitem"
          >
            <span class="caret" class:open={expanded[node.project.id]} on:click={(e) => toggle(node.project.id, e)}>▸</span>
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
                on:click={() => sel("target", tn.target.id)}
              >
                <span class="indent"></span>
                <span class="caret" class:open={expanded[tn.target.id]} on:click={(e) => toggle(tn.target.id, e)}>▸</span>
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
                    on:click={() => sel("task", task.id)}
                  >
                    <span class="indent2"></span>
                    <span class="tasktick" class:checked={task.status === "done"}></span>
                    <span class="label">{task.name}</span>
                    {#if task.owner}
                      <Avatar name={task.owner} size={16} />
                    {/if}
                  </div>
                {/each}
              {/if}
            {/each}
          {/if}
        {:else}
          <div class="empty">
            <p>No projects yet</p>
            <button class="add" on:click={() => store.openEditor({ mode: "create", kind: "project" })}>Create project</button>
          </div>
        {/each}
      </div>
    </section>
  </div>

  <!-- Section 3: Requirement pool (footer) -->
  <div class="pool" on:click={openReqPool} class:active={$tab === "requirements"} role="button">
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
    flex-shrink: 0;
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
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
  .sec {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .sec:last-child {
    flex: 1;
  }
  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px 4px;
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
  .add-form {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 2px 12px 8px;
    padding: 8px;
    background: var(--pm-input, #fff);
    border: 1px solid var(--pm-border, rgba(0, 0, 0, 0.1));
    border-radius: 9px;
  }
  .add-input,
  .add-form select {
    font: inherit;
    font-size: 12px;
    padding: 5px 8px;
    border: 1px solid var(--pm-border, rgba(0, 0, 0, 0.1));
    border-radius: 7px;
    background: var(--pm-surface, #fff);
    color: var(--pm-text, #1d1d1f);
    outline: none;
  }
  .add-form-actions {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
  }
  .mini {
    border: 1px solid var(--pm-border, rgba(0, 0, 0, 0.12));
    background: transparent;
    color: var(--pm-text, #1d1d1f);
    font: inherit;
    font-size: 11.5px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 7px;
    cursor: pointer;
  }
  .mini.primary {
    background: var(--pm-accent, #007aff);
    color: #fff;
    border-color: var(--pm-accent, #007aff);
  }
  .board-list {
    padding: 2px 8px 4px;
  }
  .tree {
    padding: 2px 8px 8px;
    flex: 1;
    overflow-y: auto;
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
  .row.board .ic {
    color: var(--pm-muted, #8e8e93);
    flex-shrink: 0;
  }
  .row.board.active .ic {
    color: var(--pm-accent, #007aff);
  }
  .rm {
    border: none;
    background: transparent;
    color: var(--pm-muted, #8e8e93);
    font-size: 14px;
    width: 18px;
    height: 18px;
    border-radius: 6px;
    cursor: pointer;
    line-height: 1;
    opacity: 0;
    transition: opacity 0.12s;
  }
  .row.board:hover .rm {
    opacity: 1;
  }
  .rm:hover {
    background: rgba(255, 59, 48, 0.12);
    color: #ff3b30;
  }
  .caret {
    font-size: 10px;
    color: var(--pm-muted, #8e8e93);
    transition: transform 0.15s;
    width: 12px;
    text-align: center;
    flex-shrink: 0;
    cursor: pointer;
    border-radius: 4px;
  }
  .caret:hover {
    background: var(--pm-hover, rgba(0, 0, 0, 0.08));
    color: var(--pm-text, #1d1d1f);
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
  .empty {
    text-align: center;
    padding: 28px 16px;
    color: var(--pm-muted, #8e8e93);
  }
  .empty p {
    margin: 0 0 10px;
    font-size: 13px;
  }
  .empty-sm {
    padding: 8px 12px 12px;
    font-size: 12px;
    color: var(--pm-muted, #8e8e93);
  }
  .pool {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    cursor: pointer;
    border-top: 1px solid var(--pm-border, rgba(0, 0, 0, 0.08));
    color: var(--pm-text, #1d1d1f);
    flex-shrink: 0;
  }
  .pool:hover {
    background: var(--pm-hover, rgba(0, 0, 0, 0.04));
  }
  .pool.active {
    color: var(--pm-accent, #007aff);
    background: color-mix(in srgb, var(--pm-accent, #007aff) 8%, transparent);
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
