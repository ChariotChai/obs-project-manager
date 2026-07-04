<script lang="ts">
  import type PmStore from "../store";
  import type { BoardItem } from "../store";
  import { parseQuery, runQuery, groupRows, fieldValue, SAMPLE_QUERY, FIELD_HINTS, entityKindOf } from "../query";
  import type { QuerySpec } from "../query";
  import type { AnyEntity, Priority } from "../types";
  import StatusDot from "./components/StatusDot.svelte";
  import Avatar from "./components/Avatar.svelte";
  import { statusLabel, priorityLabel, PRIORITY_COLORS, STATUS_COLORS } from "../constants";

  export let store: PmStore;
  export let board: BoardItem;

  const model = store.model;
  const selection = store.selection;

  let editing = false;
  let draftQuery = "";
  let parseErr: string | null = null;

  let spec: QuerySpec | null = null;
  let rows: AnyEntity[] = [];
  let groups: any[] = [];
  let columns: string[] = [];

  // The live query text is stored on the board item's `queryText` field.
  $: queryText = board.queryText ?? SAMPLE_QUERY;
  $: spec = (() => {
    const r = parseQuery(queryText);
    return r.spec;
  })();
  $: parseError = parseQuery(queryText).error;
  $: rows = spec ? runQuery(spec, $model) : [];
  $: groups = spec ? groupRows(rows, spec.groupBy, $model) : [];

  function startEdit() {
    draftQuery = queryText;
    editing = true;
  }

  function saveEdit() {
    const r = parseQuery(draftQuery);
    if (r.error) {
      parseErr = `Line ${r.error.line}: ${r.error.message}`;
      return;
    }
    parseErr = null;
    store.updateBoard(board.id, { queryText: draftQuery });
    editing = false;
  }

  function cancelEdit() {
    editing = false;
    parseErr = null;
  }

  function sel(entity: AnyEntity) {
    store.select(entityKindOf((spec as QuerySpec).from), entity.id);
  }

  function fmtCell(r: AnyEntity, field: string): string {
    const v = fieldValue(r, field, $model);
    if (!v) return "—";
    return v;
  }

  // Choose which columns to show in table view.
  $: columns = spec ? FIELD_HINTS[spec.from].slice(0, 5) : [];

  function groupColor(key: string): string {
    const s = STATUS_COLORS[key];
    if (s) return s;
    const p = PRIORITY_COLORS[key as Priority];
    if (p) return p;
    return "#8E8E93";
  }

  // Helpers so the template avoids TypeScript `as` casts (which Svelte's
  // template parser does not understand).
  function entName(r: AnyEntity): string {
    const e = r as any;
    return e.name ?? e.title ?? "";
  }
  function entStatus(r: AnyEntity): string {
    return (r as any).status ?? "";
  }
  function entOwner(r: AnyEntity): string {
    return (r as any).owner ?? "";
  }
  function entPriority(r: AnyEntity): Priority | undefined {
    return (r as any).priority;
  }
  function entPriorityColor(r: AnyEntity): string {
    const p = (r as any).priority as Priority | undefined;
    return p ? PRIORITY_COLORS[p] : "#8E8E93";
  }
  function entPriorityLabel(r: AnyEntity): string {
    const p = (r as any).priority as Priority | undefined;
    return p ? priorityLabel(p) : "";
  }
</script>

<div class="qview">
  <div class="qv-head">
    <h2>{board.name}</h2>
    <div class="qv-actions">
      {#if spec}
        <span class="qv-meta">{spec.from} · {spec.view} · {rows.length} rows</span>
      {/if}
      <button class="ghost-btn" on:click={startEdit}>Edit query</button>
    </div>
  </div>

  {#if editing}
    <div class="editor">
      <div class="editor-top">
        <label for="qv-textarea">Query</label>
        <button class="ghost-btn sm" on:click={() => (draftQuery = SAMPLE_QUERY)}>Load sample</button>
      </div>
      <textarea id="qv-textarea" bind:value={draftQuery} rows="8" spellcheck="false" placeholder={SAMPLE_QUERY}></textarea>
      {#if parseErr}
        <p class="err">{parseErr}</p>
      {/if}
      <div class="hint">
        <p>Clauses: <code>FROM</code> task|target|project|requirement · <code>WHERE</code> field op value (AND …) · <code>GROUP BY</code> field · <code>SORT</code> field ASC|DESC · <code>VIEW</code> table|kanban|list · <code>LIMIT</code> n</p>
        <p>Operators: <code>=</code> <code>!=</code> <code>&gt;</code> <code>&lt;</code> <code>&gt;=</code> <code>&lt;=</code> <code>contains</code> <code>starts</code></p>
        <p>Fields depend on the entity. Tasks: name, status, priority, owner, dueDate, projectName, targetName.</p>
      </div>
      <div class="editor-foot">
        <button class="ghost-btn" on:click={cancelEdit}>Cancel</button>
        <button class="primary-btn" on:click={saveEdit}>Apply</button>
      </div>
    </div>
  {/if}

  {#if !editing && parseError}
    <div class="qerr">
      <strong>Query error (line {parseError.line})</strong>
      <p>{parseError.message}</p>
      <button class="ghost-btn" on:click={startEdit}>Fix query</button>
    </div>
  {:else if !editing && rows.length === 0}
    <p class="muted pad">No rows matched the query. Edit the query to broaden it.</p>
  {:else if !editing}
    {#if spec.view === "table"}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              {#each columns as c}
                <th>{c}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each rows as r (r.id)}
              <tr on:click={() => sel(r)} class:active={$selection.id === r.id}>
                {#each columns as c}
                  <td>{fmtCell(r, c)}</td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else if spec.view === "list"}
      <div class="list-wrap">
        {#each rows as r (r.id)}
          <button class="list-row" on:click={() => sel(r)} class:active={$selection.id === r.id}>
            <StatusDot status={entStatus(r)} size={7} />
            <span class="lr-name">{entName(r)}</span>
            {#if entOwner(r)}
              <Avatar name={entOwner(r)} size={16} />
            {/if}
          </button>
        {/each}
      </div>
    {:else if spec.view === "kanban"}
      <div class="kanban">
        {#each groups as g (g.key)}
          <div class="kb-col">
            <div class="kb-head">
              <span class="dot" style="background:{groupColor(g.key)}"></span>
              <span>{g.key}</span>
              <span class="count">{g.rows.length}</span>
            </div>
            <div class="kb-body">
              {#each g.rows as r (r.id)}
                <button class="kb-card" on:click={() => sel(r)} class:active={$selection.id === r.id}>
                  <div class="kc-name">{entName(r)}</div>
                  {#if entPriority(r)}
                    <span class="prio" style="--c:{entPriorityColor(r)}">{entPriorityLabel(r)}</span>
                  {/if}
                  {#if entOwner(r)}
                    <div class="kc-foot"><Avatar name={entOwner(r)} size={18} /></div>
                  {/if}
                </button>
              {:else}
                <div class="kb-empty">No items</div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .qview {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .qv-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 22px 12px;
    flex-shrink: 0;
  }
  .qv-head h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
  .qv-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .qv-meta {
    font-size: 11.5px;
    color: var(--pm-muted, #8e8e93);
  }
  .ghost-btn {
    border: 1px solid var(--pm-border, rgba(0, 0, 0, 0.12));
    background: transparent;
    color: var(--pm-accent, #007aff);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    padding: 6px 12px;
    border-radius: 8px;
    cursor: pointer;
  }
  .ghost-btn.sm {
    padding: 3px 8px;
    font-size: 11px;
  }
  .ghost-btn:hover {
    background: var(--pm-hover, rgba(0, 0, 0, 0.04));
  }
  .editor {
    margin: 0 22px 12px;
    padding: 14px;
    background: var(--pm-surface, #fff);
    border: 1px solid var(--pm-border, rgba(0, 0, 0, 0.1));
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex-shrink: 0;
  }
  .editor-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .editor-top label {
    font-size: 12px;
    font-weight: 600;
    color: var(--pm-text, #1d1d1f);
  }
  .editor textarea {
    font-family: "SF Mono", "JetBrains Mono", ui-monospace, monospace;
    font-size: 12.5px;
    padding: 10px 12px;
    border: 1px solid var(--pm-border, rgba(0, 0, 0, 0.1));
    border-radius: 9px;
    background: var(--pm-input, #fff);
    color: var(--pm-text, #1d1d1f);
    outline: none;
    resize: vertical;
    line-height: 1.5;
  }
  .editor textarea:focus {
    border-color: #007aff;
    box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.12);
  }
  .hint {
    font-size: 11.5px;
    color: var(--pm-muted, #8e8e93);
    line-height: 1.6;
  }
  .hint p {
    margin: 0 0 2px;
  }
  .hint code {
    background: var(--pm-col, rgba(0, 0, 0, 0.05));
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 11px;
  }
  .err {
    color: #ff3b30;
    font-size: 12px;
    margin: 0;
  }
  .editor-foot {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .primary-btn {
    background: var(--pm-accent, #007aff);
    color: #fff;
    border: none;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    padding: 6px 14px;
    border-radius: 8px;
    cursor: pointer;
  }
  .primary-btn:hover {
    background: #006fe8;
  }
  .qerr {
    margin: 0 22px 12px;
    padding: 14px 16px;
    background: rgba(255, 59, 48, 0.08);
    border: 1px solid rgba(255, 59, 48, 0.25);
    border-radius: 12px;
    color: #ff3b30;
  }
  .qerr p {
    margin: 4px 0 8px;
    font-size: 12.5px;
  }
  .muted.pad {
    padding: 20px 26px;
    color: var(--pm-muted, #8e8e93);
    font-size: 13px;
  }
  .table-wrap {
    flex: 1;
    overflow: auto;
    padding: 0 22px 20px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
  }
  thead th {
    text-align: left;
    padding: 9px 12px;
    border-bottom: 1px solid var(--pm-border, rgba(0, 0, 0, 0.1));
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--pm-muted, #8e8e93);
    font-weight: 600;
    position: sticky;
    top: 0;
    background: var(--pm-surface, #fff);
    z-index: 1;
  }
  tbody td {
    padding: 9px 12px;
    border-bottom: 1px solid var(--pm-border, rgba(0, 0, 0, 0.05));
    color: var(--pm-text, #1d1d1f);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 220px;
  }
  tbody tr {
    cursor: pointer;
  }
  tbody tr:hover {
    background: var(--pm-hover, rgba(0, 0, 0, 0.03));
  }
  tbody tr.active {
    background: color-mix(in srgb, var(--pm-accent, #007aff) 10%, transparent);
  }
  .list-wrap {
    flex: 1;
    overflow-y: auto;
    padding: 0 22px 20px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .list-row {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    text-align: left;
    border: none;
    background: transparent;
    padding: 8px 10px;
    border-radius: 9px;
    cursor: pointer;
    font-size: 13px;
    color: var(--pm-text, #1d1d1f);
  }
  .list-row:hover {
    background: var(--pm-hover, rgba(0, 0, 0, 0.03));
  }
  .list-row.active {
    background: color-mix(in srgb, var(--pm-accent, #007aff) 10%, transparent);
    color: var(--pm-accent, #007aff);
  }
  .lr-name {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .kanban {
    flex: 1;
    display: flex;
    gap: 12px;
    padding: 0 22px 20px;
    overflow-x: auto;
    align-items: stretch;
  }
  .kb-col {
    flex: 0 0 240px;
    background: var(--pm-col, rgba(0, 0, 0, 0.025));
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .kb-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px;
    font-size: 13px;
    font-weight: 600;
    color: var(--pm-text, #1d1d1f);
  }
  .kb-head .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .kb-head .count {
    margin-left: auto;
    font-size: 11px;
    color: var(--pm-muted, #8e8e93);
    background: var(--pm-surface, #fff);
    padding: 1px 7px;
    border-radius: 999px;
  }
  .kb-body {
    flex: 1;
    overflow-y: auto;
    padding: 4px 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .kb-card {
    background: var(--pm-surface, #fff);
    border: 1px solid var(--pm-border, rgba(0, 0, 0, 0.07));
    border-radius: 11px;
    padding: 10px 12px;
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
    text-align: left;
    flex: 0 0 auto;
  }
  .kb-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }
  .kb-card.active {
    border-color: var(--pm-accent, #007aff);
    box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.15);
  }
  .kc-name {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--pm-text, #1d1d1f);
    line-height: 1.3;
  }
  .prio {
    display: inline-block;
    margin-top: 5px;
    font-size: 10px;
    font-weight: 600;
    color: var(--c);
    padding: 1px 6px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--c) 14%, transparent);
  }
  .kc-foot {
    margin-top: 7px;
    display: flex;
    justify-content: flex-end;
  }
  .kb-empty {
    text-align: center;
    color: var(--pm-muted, #8e8e93);
    font-size: 11px;
    padding: 14px 8px;
    border: 1.5px dashed var(--pm-border, rgba(0, 0, 0, 0.1));
    border-radius: 10px;
  }
</style>
