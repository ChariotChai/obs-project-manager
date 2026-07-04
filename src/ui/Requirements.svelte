<script lang="ts">
  import type PmStore from "../store";
  import type { Requirement } from "../types";
  import { statusLabel, PRIORITY_COLORS, priorityLabel } from "../constants";
  import Badge from "./components/Badge.svelte";

  export let store: PmStore;
  const model = store.model;
  const selection = store.selection;

  type Filter = "all" | "pool" | "triaged" | "held";
  const FILTERS: Filter[] = ["pool", "triaged", "held", "all"];

  let filter: Filter = "pool";
  let query = "";

  $: list = $model.requirements
    .filter((r) => (filter === "all" ? true : r.status === filter))
    .filter((r) => (query.trim() ? r.title.toLowerCase().includes(query.trim().toLowerCase()) : true))
    .sort((a, b) => b.createdAt - a.createdAt);

  function projectName(id?: string): string {
    return $model.projects.find((p) => p.id === id)?.name ?? "";
  }

  function setFilter(f: Filter) {
    filter = f;
  }
  function field(e: Event): string {
    return (e.currentTarget as HTMLInputElement | HTMLSelectElement).value;
  }
  function assignProject(e: Event, id: string) {
    store.triageRequirement(id, field(e) || undefined, "triaged");
  }
  function fmtDate(t?: number) {
    if (!t) return "";
    return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
</script>

<div class="req">
  <div class="req-head">
    <h2>Requirement pool</h2>
    <button class="primary-btn" on:click={() => store.openEditor({ mode: "create", kind: "requirement" })}>+ New requirement</button>
  </div>

  <div class="toolbar">
    <div class="seg">
      {#each FILTERS as f}
        <button class:active={filter === f} on:click={() => setFilter(f)}>
          {statusLabel(f)} ({f === "all" ? $model.requirements.length : $model.requirements.filter((r) => r.status === f).length})
        </button>
      {/each}
    </div>
    <input class="search" placeholder="Filter…" bind:value={query} />
  </div>

  <div class="list">
    {#if list.length === 0}
      <div class="empty">
        <p>No requirements here.</p>
        <button class="ghost-btn" on:click={() => store.openEditor({ mode: "create", kind: "requirement" })}>Capture a requirement</button>
      </div>
    {:else}
      {#each list as r (r.id)}
        <div class="item" class:active={$selection.kind === "requirement" && $selection.id === r.id} on:click={() => store.select("requirement", r.id)}>
          <div class="item-main">
            <div class="item-top">
              <Badge color={PRIORITY_COLORS[r.priority]} label={priorityLabel(r.priority)} />
              <Badge color={r.status === "pool" ? "#007AFF" : r.status === "triaged" ? "#34C759" : "#FF9F0A"} label={statusLabel(r.status)} />
              {#if r.source}
                <span class="source">from {r.source}</span>
              {/if}
              <span class="date">{fmtDate(r.createdAt)}</span>
            </div>
            <div class="title">{r.title}</div>
            {#if r.description}
              <div class="desc">{r.description}</div>
            {/if}
          </div>
          <div class="item-actions">
            {#if r.status !== "triaged"}
              <select
                value={r.assignedProjectId ?? ""}
                on:change={(e) => assignProject(e, r.id)}
              >
                <option value="">Assign to project…</option>
                {#each $model.projects as p}
                  <option value={p.id}>{p.name}</option>
                {/each}
              </select>
            {:else}
              <span class="assigned">→ {projectName(r.assignedProjectId) || "Unassigned"}</span>
            {/if}
            <button class="hold" on:click|stopPropagation={() => store.triageRequirement(r.id, undefined, "held")}>Hold</button>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .req {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .req-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 22px 12px;
  }
  .req-head h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
  .primary-btn {
    background: var(--pm-accent, #007aff);
    color: #fff;
    border: none;
    font-size: 12.5px;
    font-weight: 600;
    padding: 7px 14px;
    border-radius: 9px;
    cursor: pointer;
  }
  .primary-btn:hover {
    background: #006fe8;
  }
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 22px 12px;
    gap: 12px;
  }
  .seg {
    display: flex;
    background: var(--pm-col, rgba(0, 0, 0, 0.04));
    border-radius: 9px;
    padding: 3px;
  }
  .seg button {
    border: none;
    background: transparent;
    font: inherit;
    font-size: 12px;
    font-weight: 500;
    color: var(--pm-muted, #8e8e93);
    padding: 5px 12px;
    border-radius: 7px;
    cursor: pointer;
  }
  .seg button.active {
    background: var(--pm-surface, #fff);
    color: var(--pm-text, #1d1d1f);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
    font-weight: 600;
  }
  .search {
    font: inherit;
    font-size: 12px;
    padding: 7px 11px;
    border: 1px solid var(--pm-border, rgba(0, 0, 0, 0.1));
    border-radius: 8px;
    background: var(--pm-input, #fff);
    color: var(--pm-text, #1d1d1f);
    outline: none;
    width: 200px;
  }
  .list {
    flex: 1;
    overflow-y: auto;
    padding: 0 22px 22px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .item {
    display: flex;
    gap: 16px;
    background: var(--pm-surface, #fff);
    border: 1px solid var(--pm-border, rgba(0, 0, 0, 0.07));
    border-radius: 12px;
    padding: 14px 16px;
    cursor: pointer;
    transition: box-shadow 0.12s;
  }
  .item:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  }
  .item.active {
    border-color: var(--pm-accent, #007aff);
    box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.12);
  }
  .item-main {
    flex: 1;
    min-width: 0;
  }
  .item-top {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
    flex-wrap: wrap;
  }
  .source,
  .date {
    font-size: 11px;
    color: var(--pm-muted, #8e8e93);
  }
  .title {
    font-size: 14px;
    font-weight: 600;
    color: var(--pm-text, #1d1d1f);
  }
  .desc {
    font-size: 12.5px;
    color: var(--pm-muted, #8e8e93);
    margin-top: 4px;
    line-height: 1.5;
  }
  .item-actions {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
    flex-shrink: 0;
  }
  .item-actions select {
    font: inherit;
    font-size: 12px;
    padding: 6px 9px;
    border: 1px solid var(--pm-border, rgba(0, 0, 0, 0.1));
    border-radius: 8px;
    background: var(--pm-input, #fff);
    color: var(--pm-text, #1d1d1f);
    outline: none;
    min-width: 160px;
  }
  .assigned {
    font-size: 12px;
    color: #34c759;
    font-weight: 600;
  }
  .hold {
    border: 1px solid var(--pm-border, rgba(0, 0, 0, 0.12));
    background: transparent;
    color: var(--pm-muted, #8e8e93);
    font-size: 11px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 7px;
    cursor: pointer;
  }
  .hold:hover {
    color: #ff9f0a;
    border-color: #ff9f0a;
  }
  .empty {
    text-align: center;
    padding: 40px 16px;
    color: var(--pm-muted, #8e8e93);
  }
  .empty p {
    margin: 0 0 12px;
    font-size: 13px;
  }
  .ghost-btn {
    border: 1px solid var(--pm-border, rgba(0, 0, 0, 0.12));
    background: transparent;
    color: var(--pm-accent, #007aff);
    font-size: 12px;
    font-weight: 600;
    padding: 6px 12px;
    border-radius: 8px;
    cursor: pointer;
  }
</style>
