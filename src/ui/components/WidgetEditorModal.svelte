<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import Modal from "./Modal.svelte";
  import type { WidgetView, WidgetSize, DashboardWidget } from "../../store";
  import { parseQuery, SAMPLE_QUERY, FIELD_HINTS } from "../../query";
  import type { QuerySpec } from "../../query";

  const dispatch = createEventDispatcher();

  export let editingId: string | null = null;
  export let draft: {
    title: string;
    queryText: string;
    view: WidgetView;
    size: WidgetSize;
    groupBy: string;
  } | null = null;

  let draftError: string | null = null;

  const VIEWS: { value: WidgetView; label: string; hint: string }[] = [
    { value: "table", label: "Table", hint: "Rows + columns" },
    { value: "list", label: "List", hint: "Compact one-line items" },
    { value: "kanban", label: "Kanban", hint: "Group by status" },
    { value: "pie", label: "Pie", hint: "Group distribution" },
    { value: "donut", label: "Donut", hint: "Group distribution w/ total" },
    { value: "bar", label: "Bar", hint: "Horizontal bars per group" },
    { value: "metric", label: "Metric", hint: "Single big number" },
    { value: "progress", label: "Progress", hint: "Done vs total ring" },
    { value: "timeline", label: "Timeline", hint: "Gantt-style date bars" },
  ];

  const SIZES: { value: WidgetSize; label: string; span: number }[] = [
    { value: "small", label: "S", span: 1 },
    { value: "medium", label: "M", span: 2 },
    { value: "large", label: "L", span: 3 },
    { value: "full", label: "Full", span: 4 },
  ];

  function groupByHints(spec: QuerySpec | null): string[] {
    if (!spec) return [];
    return FIELD_HINTS[spec.from];
  }

  function cancelEdit() {
    dispatch("cancel");
  }

  function saveWidget() {
    if (!draft) return;
    const parsed = parseQuery(draft.queryText);
    if (parsed.error) {
      draftError = `Line ${parsed.error.line}: ${parsed.error.message}`;
      return;
    }
    let groupBy = draft.groupBy.trim();
    if (!groupBy && (draft.view === "pie" || draft.view === "donut" || draft.view === "bar" || draft.view === "kanban")) {
      groupBy = parsed.spec?.groupBy ?? (parsed.spec?.from === "task" ? "status" : "status");
    }
    const payload = {
      title: draft.title.trim() || "Untitled",
      queryText: draft.queryText,
      view: draft.view,
      size: draft.size,
      groupBy: groupBy || undefined,
    };
    dispatch("save", { editingId, payload });
  }

  $: titleText = editingId === "new" ? "Add widget" : "Edit widget";
</script>

<Modal {titleText} width={560} on:close={cancelEdit}>
  {#if draft}
    <div class="grid">
      <label class="field">
        <span class="lbl">Title</span>
        <input type="text" bind:value={draft.title} placeholder="Widget title" />
      </label>
      <label class="field size-field">
        <span class="lbl">Size</span>
        <select bind:value={draft.size}>
          {#each SIZES as s}
            <option value={s.value}>{s.label} ({s.span}/4)</option>
          {/each}
        </select>
      </label>
      <label class="field full">
        <span class="lbl">Query</span>
        <textarea bind:value={draft.queryText} rows="6" spellcheck="false" placeholder={SAMPLE_QUERY}></textarea>
      </label>
      {#if draftError}
        <p class="err">{draftError}</p>
      {/if}
      <label class="field">
        <span class="lbl">View</span>
        <select bind:value={draft.view}>
          {#each VIEWS as v}
            <option value={v.value}>{v.label} — {v.hint}</option>
          {/each}
        </select>
      </label>
      <label class="field">
        <span class="lbl">Group by (optional)</span>
        <input type="text" bind:value={draft.groupBy} placeholder="status, priority, owner, …" list="groupByHints" />
        <datalist id="groupByHints">
          {#each groupByHints(parseQuery(draft.queryText).spec) as h}
            <option value={h}></option>
          {/each}
        </datalist>
      </label>
      <div class="hint full">
        <p>Clauses: <code>FROM</code> task|target|project|requirement · <code>WHERE</code> field op value (AND …) · <code>GROUP BY</code> field · <code>SORT</code> field ASC|DESC · <code>VIEW</code> … · <code>LIMIT</code> n</p>
        <p>Operators: <code>=</code> <code>!=</code> <code>&gt;</code> <code>&lt;</code> <code>&gt;=</code> <code>&lt;=</code> <code>contains</code> <code>starts</code></p>
      </div>
    </div>
  {/if}

  <svelte:fragment slot="footer">
    <button class="ghost-btn" on:click={cancelEdit}>Cancel</button>
    <button class="primary-btn" on:click={saveWidget}>{editingId === "new" ? "Add" : "Save"}</button>
  </svelte:fragment>
</Modal>

<style>
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .full {
    grid-column: 1 / -1;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
  }
  .field .lbl {
    color: var(--pm-muted, #8e8e93);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    font-size: 10.5px;
  }
  .field input,
  .field select,
  .field textarea {
    font: inherit;
    font-size: 12.5px;
    padding: 8px 10px;
    border: 1px solid var(--pm-border, rgba(0, 0, 0, 0.1));
    border-radius: 8px;
    background: var(--pm-input, #fff);
    color: var(--pm-text, #1d1d1f);
    outline: none;
    font-family: inherit;
  }
  .field textarea {
    font-family: "SF Mono", "JetBrains Mono", ui-monospace, monospace;
    font-size: 12px;
    resize: vertical;
    line-height: 1.5;
  }
  .field input:focus,
  .field select:focus,
  .field textarea:focus {
    border-color: var(--pm-accent, #007aff);
    box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.12);
  }
  .size-field {
    max-width: 160px;
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
    grid-column: 1 / -1;
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
  .ghost-btn:hover {
    background: var(--pm-hover, rgba(0, 0, 0, 0.04));
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
</style>