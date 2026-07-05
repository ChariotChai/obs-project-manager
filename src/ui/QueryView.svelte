<script lang="ts">
  import type PmStore from "../store";
  import type { BoardItem, DashboardWidget, WidgetView, WidgetSize } from "../store";
  import { parseQuery, runQuery, groupRows, fieldValue, SAMPLE_QUERY, FIELD_HINTS, entityKindOf } from "../query";
  import type { QuerySpec, QueryEntity, QueryGroup } from "../query";
  import type { AnyEntity, Priority, ProjectStatus, TargetStatus, TaskStatus, RequirementStatus } from "../types";
  import StatusDot from "./components/StatusDot.svelte";
  import Avatar from "./components/Avatar.svelte";
  import ConfirmModal from "./components/ConfirmModal.svelte";
  import {
    priorityLabel,
    PRIORITY_COLORS,
    STATUS_COLORS,
    TASK_STATUSES,
    TARGET_STATUSES,
    PROJECT_STATUSES,
    REQUIREMENT_STATUSES,
    PRIORITIES,
  } from "../constants";

  export let store: PmStore;
  export let board: BoardItem;

  const model = store.model;
  const selection = store.selection;

  // ---- Widget list ----
  $: widgets = board.widgets ?? [];

  // ---- Per-widget live query results, memoised by widget id ----
  type WidgetResult = {
    spec: QuerySpec | null;
    error: { line: number; message: string } | null;
    rows: AnyEntity[];
    groups: { key: string; rows: AnyEntity[] }[];
    columns: string[];
  };

  function runWidget(w: DashboardWidget): WidgetResult {
    const parsed = parseQuery(w.queryText || "");
    if (parsed.error || !parsed.spec) {
      return { spec: null, error: parsed.error, rows: [], groups: [], columns: [] };
    }
    const spec = parsed.spec;
    const rows = runQuery(spec, $model);
    // Use the widget's groupBy if set, otherwise fall back to the spec's groupBy.
    const groupBy = w.groupBy || spec.groupBy;
    const groups = groupRows(rows, groupBy, $model);
    const columns = FIELD_HINTS[spec.from].slice(0, 5);
    return { spec, error: null, rows, groups, columns };
  }

  $: results = widgets.map((w) => runWidget(w));

  // ---- Widget editor state ----
  let editingId: string | null = null;
  let draft: {
    title: string;
    queryText: string;
    view: WidgetView;
    size: WidgetSize;
    groupBy: string;
  } | null = null;
  let draftError: string | null = null;

  // ---- Widget deletion confirmation ----
  let pendingDeleteWidget: DashboardWidget | null = null;

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

  function sizeSpan(s: WidgetSize): number {
    return SIZES.find((x) => x.value === s)?.span ?? 2;
  }
  function viewLabel(v: WidgetView): string {
    return VIEWS.find((x) => x.value === v)?.label ?? v;
  }

  function startAddWidget() {
    editingId = "new";
    draft = {
      title: "New widget",
      queryText: SAMPLE_QUERY,
      view: "table",
      size: "medium",
      groupBy: "",
    };
    draftError = null;
  }

  function startEditWidget(w: DashboardWidget) {
    editingId = w.id;
    draft = { title: w.title, queryText: w.queryText, view: w.view, size: w.size, groupBy: w.groupBy ?? "" };
    draftError = null;
  }

  function cancelEdit() {
    editingId = null;
    draft = null;
    draftError = null;
  }

  function saveWidget() {
    if (!draft) return;
    const parsed = parseQuery(draft.queryText);
    if (parsed.error) {
      draftError = `Line ${parsed.error.line}: ${parsed.error.message}`;
      return;
    }
    // If view is a chart that needs grouping and groupBy is empty, default it.
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
    if (editingId === "new") {
      store.addWidget(board.id, payload);
    } else if (editingId) {
      store.updateWidget(board.id, editingId, payload);
    }
    editingId = null;
    draft = null;
    draftError = null;
  }

  function askRemoveWidget(w: DashboardWidget) {
    pendingDeleteWidget = w;
  }

  function doRemoveWidget() {
    if (pendingDeleteWidget) store.removeWidget(board.id, pendingDeleteWidget.id);
    pendingDeleteWidget = null;
  }

  function cancelRemoveWidget() {
    pendingDeleteWidget = null;
  }

  // ---- Drag-and-drop widget reordering ----
  // The card is draggable ONLY while "armed" by a mousedown on its drag
  // handle. This keeps inner widgets (e.g. kanban cards) free to host their
  // own drag interactions without the whole widget hijacking the gesture.
  let armedDragId: string | null = null;
  let dragFromIndex: number | null = null;
  let dragOverIndex: number | null = null;

  function onHandleMouseDown(w: DashboardWidget) {
    armedDragId = w.id;
  }
  function onHandleMouseUp() {
    armedDragId = null;
  }
  function onGlobalMouseUp() {
    armedDragId = null;
  }

  function onWidgetDragStart(e: DragEvent, index: number, w: DashboardWidget) {
    // Ignore dragstart events that bubbled up from a draggable child (kanban
    // cards); those are handled by their own handlers below.
    if (armedDragId !== w.id) return;
    dragFromIndex = index;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      // Required for Firefox to start the drag.
      e.dataTransfer.setData("text/plain", String(index));
    }
  }

  function onWidgetDragOver(e: DragEvent, index: number) {
    if (dragFromIndex === null) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    dragOverIndex = index;
  }

  function onWidgetDrop(e: DragEvent, index: number) {
    e.preventDefault();
    const from = dragFromIndex;
    dragFromIndex = null;
    dragOverIndex = null;
    if (from === null || from === index) return;
    store.reorderWidgets(board.id, from, index);
  }

  function onWidgetDragEnd() {
    dragFromIndex = null;
    dragOverIndex = null;
    armedDragId = null;
  }

  // ---- Kanban card drag-and-drop (between columns) ----
  // Dragging a card onto another column updates the entity's grouped field
  // (status by default, also supports priority) and persists the change.
  let kanbanDragId: string | null = null;
  let kanbanDropKey: string | null = null;

  function onKanbanCardDragStart(e: DragEvent, r: AnyEntity) {
    kanbanDragId = r.id;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", r.id);
    }
  }

  function onKanbanCardDragEnd() {
    kanbanDragId = null;
    kanbanDropKey = null;
  }

  function onKanbanColDragOver(e: DragEvent, key: string) {
    if (kanbanDragId === null) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    kanbanDropKey = key;
  }

  function onKanbanColDragLeave(e: DragEvent, key: string) {
    const related = e.relatedTarget as HTMLElement | null;
    const col = e.currentTarget as HTMLElement;
    if (!related || !col.contains(related)) {
      if (kanbanDropKey === key) kanbanDropKey = null;
    }
  }

  async function onKanbanColDrop(e: DragEvent, from: QueryEntity | undefined, field: string, key: string) {
    e.preventDefault();
    e.stopPropagation();
    const id = kanbanDragId;
    kanbanDragId = null;
    kanbanDropKey = null;
    if (!id || !key || key === "—") return;
    await updateEntityField(from, id, field, key);
  }

  /** Update an entity's grouped field. Only status & priority are supported
   *  (the meaningful draggable groupings). */
  async function updateEntityField(from: QueryEntity | undefined, id: string, field: string, value: string) {
    if (!from) return;
    if (field !== "status" && field !== "priority") return;
    try {
      if (from === "task") {
        if (field === "status") await store.updateTask(id, { status: value as TaskStatus });
        else await store.updateTask(id, { priority: value as Priority });
      } else if (from === "target") {
        if (field === "status") await store.updateTarget(id, { status: value as TargetStatus });
      } else if (from === "project") {
        if (field === "status") await store.updateProject(id, { status: value as ProjectStatus });
      } else if (from === "requirement") {
        if (field === "status") await store.updateRequirement(id, { status: value as RequirementStatus });
      }
    } catch (err) {
      console.error("kanban drop update failed", err);
    }
  }

  /** Build the full set of kanban columns (including empty ones) so the board
   *  always shows every configured status / priority, Jira-style. */
  function kanbanColumns(from: QueryEntity | undefined, field: string, groups: QueryGroup[]): QueryGroup[] {
    let keys: string[] = [];
    if (field === "status") {
      keys =
        from === "task"
          ? [...TASK_STATUSES]
          : from === "target"
          ? [...TARGET_STATUSES]
          : from === "project"
          ? [...PROJECT_STATUSES]
          : from === "requirement"
          ? [...REQUIREMENT_STATUSES]
          : [];
    } else if (field === "priority") {
      keys = [...PRIORITIES];
    }
    if (keys.length === 0) return groups;
    const map = new Map(groups.map((g) => [g.key, g]));
    const result: QueryGroup[] = [];
    for (const k of keys) {
      result.push(map.has(k) ? map.get(k)! : { key: k, rows: [] });
    }
    // Append any unexpected keys (e.g. "—") at the end.
    for (const g of groups) {
      if (!keys.includes(g.key)) result.push(g);
    }
    return result;
  }

  // ---- Selection handling ----
  function sel(spec: QuerySpec | null, entity: AnyEntity) {
    if (!spec) return;
    store.select(entityKindOf(spec.from), entity.id);
  }
  /** Select an entity by id alone (used by timeline rows that synthesise a stub). */
  function selById(spec: QuerySpec | null, id: string) {
    if (!spec) return;
    store.select(entityKindOf(spec.from), id);
  }

  // ---- Cell formatting ----
  function fmtCell(r: AnyEntity, field: string): string {
    const v = fieldValue(r, field, $model);
    if (!v) return "—";
    return v;
  }

  // ---- Helpers (no `as` casts in template) ----
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
  function entDueDate(r: AnyEntity): string {
    return (r as any).dueDate ?? "";
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
  function entStartDate(r: AnyEntity): string {
    return (r as any).startDate ?? "";
  }
  function entEndDate(r: AnyEntity): string {
    // Tasks use `dueDate` as their end.
    return (r as any).endDate ?? (r as any).dueDate ?? "";
  }
  function entProjectId(r: AnyEntity): string {
    return (r as any).projectId ?? "";
  }
  function entProjectColor(r: AnyEntity): string {
    const pid = entProjectId(r);
    if (!pid) return "#007AFF";
    return $model.projects.find((p) => p.id === pid)?.color ?? "#007AFF";
  }

  // ---- Chart palette ----
  const CHART_COLORS = ["#007AFF", "#34C759", "#FF9F0A", "#FF3B30", "#AF52DE", "#5AC8FA", "#FFD60A", "#FF2D55"];

  function groupColor(key: string, index: number): string {
    const s = STATUS_COLORS[key];
    if (s) return s;
    const p = PRIORITY_COLORS[key as Priority];
    if (p) return p;
    return CHART_COLORS[index % CHART_COLORS.length];
  }

  // ---- Pie / donut SVG arc computation ----
  function polar(cx: number, cy: number, r: number, angle: number): [number, number] {
    const a = ((angle - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }

  function arcPath(cx: number, cy: number, rOuter: number, rInner: number, startAngle: number, endAngle: number): string {
    // For pie charts, rInner = 0; for donut, rInner > 0.
    const [x1o, y1o] = polar(cx, cy, rOuter, startAngle);
    const [x2o, y2o] = polar(cx, cy, rOuter, endAngle);
    const large = endAngle - startAngle > 180 ? 1 : 0;
    if (rInner <= 0) {
      return `M ${cx} ${cy} L ${x1o} ${y1o} A ${rOuter} ${rOuter} 0 ${large} 1 ${x2o} ${y2o} Z`;
    }
    const [x1i, y1i] = polar(cx, cy, rInner, startAngle);
    const [x2i, y2i] = polar(cx, cy, rInner, endAngle);
    return `M ${x1o} ${y1o} A ${rOuter} ${rOuter} 0 ${large} 1 ${x2o} ${y2o} L ${x2i} ${y2i} A ${rInner} ${rInner} 0 ${large} 0 ${x1i} ${y1i} Z`;
  }

  type PieSlice = { path: string; color: string; key: string; count: number; pct: number };

  function pieData(groups: { key: string; rows: AnyEntity[] }[], rOuter: number, rInner: number): PieSlice[] {
    const total = groups.reduce((s, g) => s + g.rows.length, 0);
    if (total === 0) return [];
    let angle = 0;
    return groups.map((g, i) => {
      const frac = g.rows.length / total;
      const start = angle;
      const end = angle + frac * 360;
      angle = end;
      return {
        path: arcPath(50, 50, rOuter, rInner, start, Math.min(end, start + 359.99)),
        color: groupColor(g.key, i),
        key: g.key,
        count: g.rows.length,
        pct: Math.round(frac * 100),
      };
    });
  }

  // ---- Bar chart data ----
  type BarItem = { key: string; count: number; color: string; pct: number };
  function barData(groups: { key: string; rows: AnyEntity[] }[]): { items: BarItem[]; max: number } {
    const items = groups.map((g, i) => ({
      key: g.key,
      count: g.rows.length,
      color: groupColor(g.key, i),
      pct: 0,
    }));
    const max = Math.max(1, ...items.map((x) => x.count));
    for (const it of items) it.pct = Math.round((it.count / max) * 100);
    return { items, max };
  }

  // ---- Progress ring data ----
  function progressData(rows: AnyEntity[]): { pct: number; done: number; total: number; circumference: number; dash: number } {
    const total = rows.length;
    const done = rows.filter((r) => (r as any).status === "done").length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    const r = 36;
    const circumference = 2 * Math.PI * r;
    const dash = (pct / 100) * circumference;
    return { pct, done, total, circumference, dash };
  }

  // ---- Metric value: choose a sensible single number from the result set ----
  function metricValue(spec: QuerySpec | null, rows: AnyEntity[]): { value: string; label: string } {
    if (!spec) return { value: "0", label: "rows" };
    const value = String(rows.length);
    const label = `${spec.from} count`;
    return { value, label };
  }

  // ---- Field suggestions for the groupBy input ----
  function groupByHints(spec: QuerySpec | null): string[] {
    if (!spec) return [];
    return FIELD_HINTS[spec.from];
  }

  // ---- Timeline view data (Jira plan-style) ----
  // A sticky left "name" column + a horizontally scrollable track with month
  // gridlines, a today indicator, and bars coloured by status with a progress
  // fill. Clicking a bar (or its name) selects the entity.
  const DAY_PX = 26;
  const LEFT_W = 200;

  type TimelineRow = {
    id: string;
    name: string;
    start: number | null;
    end: number | null;
    color: string;
    status: string;
    progress: number;
    cancelled: boolean;
  };

  function toTime(d: string): number {
    if (!d) return NaN;
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

  /** Status-derived progress when no child tasks are available. */
  function statusProgress(status: string): number {
    if (status === "done" || status === "completed" || status === "triaged") return 100;
    if (status === "cancelled") return 100;
    if (status === "in-progress" || status === "active") return 60;
    if (status === "blocked") return 25;
    if (status === "on-hold") return 15;
    if (status === "held") return 0;
    return 0; // todo, planning, pool
  }

  /** Compute progress % from child tasks for projects/targets; fall back to a
   *  status-based estimate for leaves. */
  function entityProgress(r: AnyEntity): number {
    if (r.kind === "target") {
      const tasks = $model.tasks.filter((t) => t.targetId === r.id);
      if (tasks.length) {
        const done = tasks.filter((t) => t.status === "done").length;
        return Math.round((done / tasks.length) * 100);
      }
    } else if (r.kind === "project") {
      const tasks = $model.tasks.filter((t) => t.projectId === r.id);
      if (tasks.length) {
        const done = tasks.filter((t) => t.status === "done").length;
        return Math.round((done / tasks.length) * 100);
      }
    }
    return statusProgress(entStatus(r));
  }

  function timelineData(rows: AnyEntity[]): {
    items: TimelineRow[];
    min: number;
    max: number;
    days: number;
    width: number;
    months: { label: string; left: number; width: number }[];
    weeks: { left: number }[];
    todayLeft: number;
  } {
    const items: TimelineRow[] = rows.map((r) => {
      const sd = entStartDate(r);
      const ed = entEndDate(r);
      const status = entStatus(r);
      return {
        id: r.id,
        name: entName(r),
        start: sd ? toTime(sd) : null,
        end: ed ? toTime(ed) : null,
        color: STATUS_COLORS[status] ?? entProjectColor(r),
        status,
        progress: entityProgress(r),
        cancelled: status === "cancelled",
      };
    });
    // Sort items by start date (unknown starts last) for a stable, scannable
    // chart, like Jira's timeline.
    items.sort((a, b) => {
      const sa = a.start ?? Infinity;
      const sb = b.start ?? Infinity;
      return sa - sb;
    });
    let min = Infinity;
    let max = -Infinity;
    for (const it of items) {
      if (it.start !== null && Number.isFinite(it.start)) min = Math.min(min, it.start);
      if (it.end !== null && Number.isFinite(it.end)) max = Math.max(max, it.end);
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      const now = Date.now();
      min = now - 14 * 86400000;
      max = now + 30 * 86400000;
    }
    min = floorToDay(min) - 2 * 86400000;
    max = ceilToDay(max) + 2 * 86400000;
    const days = Math.max(1, Math.round((max - min) / 86400000));
    const width = days * DAY_PX;

    const months: { label: string; left: number; width: number }[] = [];
    const weeks: { left: number }[] = [];
    let cursor = min;
    while (cursor < max) {
      const d = new Date(cursor);
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
      const start = Math.max(cursor, monthStart);
      const end = Math.min(max, next);
      months.push({
        label: d.toLocaleDateString(undefined, { month: "short", year: "numeric" }),
        left: ((start - min) / 86400000) * DAY_PX,
        width: ((end - start) / 86400000) * DAY_PX,
      });
      cursor = next;
    }
    // Weekly gridlines starting from the first Monday on/after min.
    {
      const first = new Date(min);
      const dow = first.getDay(); // 0=Sun..6=Sat
      const offset = (8 - dow) % 7; // days until next Monday
      let w = min + offset * 86400000;
      while (w < max) {
        weeks.push({ left: ((w - min) / 86400000) * DAY_PX });
        w += 7 * 86400000;
      }
    }
    const todayLeft = ((floorToDay(Date.now()) - min) / 86400000) * DAY_PX;
    return { items, min, max, days, width, months, weeks, todayLeft };
  }

  function tlBarLeft(it: TimelineRow, min: number): number {
    const s =
      it.start !== null && Number.isFinite(it.start)
        ? it.start
        : it.end !== null && Number.isFinite(it.end)
        ? it.end - 86400000
        : min;
    return Math.max(0, ((s - min) / 86400000) * DAY_PX);
  }
  function tlBarWidth(it: TimelineRow, min: number): number {
    const s =
      it.start !== null && Number.isFinite(it.start)
        ? it.start
        : it.end !== null && Number.isFinite(it.end)
        ? it.end - 86400000
        : min;
    const e =
      it.end !== null && Number.isFinite(it.end)
        ? it.end
        : it.start !== null && Number.isFinite(it.start)
        ? it.start + 86400000
        : min + 86400000;
    return Math.max(DAY_PX * 0.6, ((e - s) / 86400000) * DAY_PX);
  }
  function fmtDate(t: number | null): string {
    if (t === null || !Number.isFinite(t)) return "";
    const d = new Date(t);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
</script>

<svelte:window on:mouseup={onGlobalMouseUp} />

<div class="qview">
  <div class="qv-head">
    <h2>{board.name}</h2>
    <div class="qv-actions">
      <span class="qv-meta">{widgets.length} widget{widgets.length === 1 ? "" : "s"}</span>
      <button class="ghost-btn primary" on:click={startAddWidget}>+ Add widget</button>
    </div>
  </div>

  {#if editingId !== null && draft}
    <div class="editor">
      <div class="editor-top">
        <span class="editor-title">{editingId === "new" ? "Add widget" : "Edit widget"}</span>
      </div>
      <div class="form-row">
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
      </div>
      <label class="field">
        <span class="lbl">Query</span>
        <textarea bind:value={draft.queryText} rows="6" spellcheck="false" placeholder={SAMPLE_QUERY}></textarea>
      </label>
      {#if draftError}
        <p class="err">{draftError}</p>
      {/if}
      <div class="form-row">
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
      </div>
      <div class="hint">
        <p>Clauses: <code>FROM</code> task|target|project|requirement · <code>WHERE</code> field op value (AND …) · <code>GROUP BY</code> field · <code>SORT</code> field ASC|DESC · <code>VIEW</code> … · <code>LIMIT</code> n</p>
        <p>Operators: <code>=</code> <code>!=</code> <code>&gt;</code> <code>&lt;</code> <code>&gt;=</code> <code>&lt;=</code> <code>contains</code> <code>starts</code></p>
      </div>
      <div class="editor-foot">
        <button class="ghost-btn" on:click={cancelEdit}>Cancel</button>
        <button class="primary-btn" on:click={saveWidget}>{editingId === "new" ? "Add" : "Save"}</button>
      </div>
    </div>
  {/if}

  {#if widgets.length === 0 && editingId === null}
    <div class="empty-board">
      <p>No widgets yet.</p>
      <button class="primary-btn" on:click={startAddWidget}>+ Add your first widget</button>
    </div>
  {:else}
    <div class="grid">
      {#each widgets as w, i (w.id)}
        {@const res = results[i]}
        <article
          class="card span-{w.size}"
          style="--span:{sizeSpan(w.size)}"
          class:dragging={dragFromIndex === i}
          class:drop-target={dragOverIndex === i && dragFromIndex !== null && dragFromIndex !== i}
          draggable={armedDragId === w.id}
          on:dragstart={(e) => onWidgetDragStart(e, i, w)}
          on:dragover={(e) => onWidgetDragOver(e, i)}
          on:drop={(e) => onWidgetDrop(e, i)}
          on:dragend={onWidgetDragEnd}
        >
          <header class="card-head">
            <span
              class="drag-handle"
              title="Drag to reorder"
              on:mousedown={() => onHandleMouseDown(w)}
              on:mouseup={onHandleMouseUp}
            >⠿</span>
            <span class="card-title">{w.title}</span>
            <span class="card-badge">{viewLabel(w.view)}</span>
            <div class="card-tools">
              <button class="tool" title="Edit" on:click={() => startEditWidget(w)}>✎</button>
              <button class="tool danger" title="Remove" on:click={() => askRemoveWidget(w)}>×</button>
            </div>
          </header>

          <div class="card-body">
            {#if res.error}
              <div class="qerr">
                <strong>Query error (line {res.error.line})</strong>
                <p>{res.error.message}</p>
                <button class="ghost-btn sm" on:click={() => startEditWidget(w)}>Fix</button>
              </div>
            {:else if !res.spec}
              <p class="muted">No query.</p>
            {:else if res.rows.length === 0 && (w.view === "table" || w.view === "list" || w.view === "kanban" || w.view === "timeline")}
              <p class="muted">No rows matched.</p>
            {:else}
              {#if w.view === "table"}
                <div class="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {#each res.columns as c}
                          <th>{c}</th>
                        {/each}
                      </tr>
                    </thead>
                    <tbody>
                      {#each res.rows as r (r.id)}
                        <tr on:click={() => sel(res.spec, r)} class:active={$selection.id === r.id}>
                          {#each res.columns as c}
                            <td>{fmtCell(r, c)}</td>
                          {/each}
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {:else if w.view === "list"}
                <div class="list-wrap">
                  {#each res.rows as r (r.id)}
                    <button class="list-row" on:click={() => sel(res.spec, r)} class:active={$selection.id === r.id}>
                      <StatusDot status={entStatus(r)} size={7} />
                      <span class="lr-name">{entName(r)}</span>
                      {#if entOwner(r)}
                        <Avatar name={entOwner(r)} size={16} />
                      {/if}
                    </button>
                  {/each}
                </div>
              {:else if w.view === "kanban"}
                {@const kbField = w.groupBy || res.spec?.groupBy || "status"}
                {@const cols = kanbanColumns(res.spec?.from, kbField, res.groups)}
                <div class="kanban">
                  {#each cols as g, gi (g.key)}
                    <div
                      class="kb-col"
                      class:kb-drop={kanbanDropKey === g.key}
                      on:dragover={(e) => onKanbanColDragOver(e, g.key)}
                      on:dragleave={(e) => onKanbanColDragLeave(e, g.key)}
                      on:drop={(e) => onKanbanColDrop(e, res.spec?.from, kbField, g.key)}
                    >
                      <div class="kb-head">
                        <span class="dot" style="background:{groupColor(g.key, gi)}"></span>
                        <span class="kb-label">{g.key}</span>
                        <span class="count">{g.rows.length}</span>
                      </div>
                      <div class="kb-body">
                        {#each g.rows as r (r.id)}
                          <div
                            class="kb-card"
                            class:active={$selection.id === r.id}
                            class:kb-dragging={kanbanDragId === r.id}
                            draggable="true"
                            on:dragstart={(e) => onKanbanCardDragStart(e, r)}
                            on:dragend={onKanbanCardDragEnd}
                            on:click={() => sel(res.spec, r)}
                            role="button"
                          >
                            <div class="kc-top">
                              <StatusDot status={entStatus(r)} size={8} />
                              <span class="kc-name">{entName(r)}</span>
                            </div>
                            <div class="kc-meta">
                              {#if entPriority(r)}
                                <span class="kc-prio" style="--c:{entPriorityColor(r)}">{entPriorityLabel(r)}</span>
                              {/if}
                              {#if entDueDate(r)}
                                <span class="kc-due" title="Due date">{entDueDate(r)}</span>
                              {/if}
                            </div>
                            {#if entOwner(r)}
                              <div class="kc-foot"><Avatar name={entOwner(r)} size={18} /></div>
                            {/if}
                          </div>
                        {:else}
                          <div class="kb-empty">Drop here</div>
                        {/each}
                      </div>
                    </div>
                  {/each}
                </div>
              {:else if w.view === "pie" || w.view === "donut"}
                {@const slices = pieData(res.groups, 50, w.view === "donut" ? 28 : 0)}
                {#if slices.length === 0}
                  <p class="muted">No data.</p>
                {:else}
                  <div class="chart-row">
                    <svg class="pie-svg" viewBox="0 0 100 100">
                      {#each slices as s}
                        <path d={s.path} fill={s.color} stroke="#fff" stroke-width="0.8"></path>
                      {/each}
                      {#if w.view === "donut"}
                        <text x="50" y="48" text-anchor="middle" class="pie-center-num">{res.rows.length}</text>
                        <text x="50" y="60" text-anchor="middle" class="pie-center-lbl">total</text>
                      {/if}
                    </svg>
                    <ul class="legend">
                      {#each slices as s}
                        <li>
                          <span class="lg-dot" style="background:{s.color}"></span>
                          <span class="lg-key">{s.key}</span>
                          <span class="lg-num">{s.count}</span>
                          <span class="lg-pct">{s.pct}%</span>
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}
              {:else if w.view === "bar"}
                {@const bd = barData(res.groups)}
                <div class="bar-list">
                  {#each bd.items as it}
                    <div class="bar-row">
                      <span class="bar-key" title={it.key}>{it.key}</span>
                      <div class="bar-track">
                        <div class="bar-fill" style="width:{it.pct}%; background:{it.color}"></div>
                      </div>
                      <span class="bar-num">{it.count}</span>
                    </div>
                  {:else}
                    <p class="muted">No data.</p>
                  {/each}
                </div>
              {:else if w.view === "metric"}
                {@const mv = metricValue(res.spec, res.rows)}
                <div class="metric">
                  <div class="metric-value">{mv.value}</div>
                  <div class="metric-label">{mv.label}</div>
                </div>
              {:else if w.view === "progress"}
                {@const pd = progressData(res.rows)}
                <div class="progress-wrap">
                  <svg class="progress-svg" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="36" fill="none" stroke="var(--pm-track, rgba(0,0,0,0.08))" stroke-width="8"></circle>
                    <circle
                      cx="50" cy="50" r="36" fill="none"
                      stroke="#34C759" stroke-width="8" stroke-linecap="round"
                      stroke-dasharray="{pd.dash} {pd.circumference - pd.dash}"
                      transform="rotate(-90 50 50)"
                    ></circle>
                    <text x="50" y="48" text-anchor="middle" class="progress-num">{pd.pct}%</text>
                    <text x="50" y="62" text-anchor="middle" class="progress-lbl">{pd.done}/{pd.total}</text>
                  </svg>
                  <p class="progress-caption">Done vs total</p>
                </div>
              {:else if w.view === "timeline"}
                {@const tl = timelineData(res.rows)}
                <div class="tl">
                  <div class="tl-scroll">
                    <div class="tl-canvas" style="width:{LEFT_W + tl.width}px">
                      <!-- Header (sticky top). Corner sticks both top & left. -->
                      <div class="tl-head">
                        <div class="tl-corner">Item</div>
                        <div class="tl-axis" style="width:{tl.width}px">
                          {#each tl.months as m}
                            <div class="tl-month" style="left:{m.left}px;width:{m.width}px">{m.label}</div>
                          {/each}
                        </div>
                      </div>
                      <!-- Today line spans the full canvas height (under names). -->
                      <div class="tl-today" style="left:{LEFT_W + tl.todayLeft}px"></div>
                      <!-- Vertical gridlines (weeks + month boundaries) behind rows. -->
                      <div class="tl-grid" style="left:{LEFT_W}px;width:{tl.width}px">
                        {#each tl.weeks as wk}
                          <div class="tl-weekline" style="left:{wk.left}px"></div>
                        {/each}
                        {#each tl.months as m}
                          <div class="tl-monthline" style="left:{m.left}px"></div>
                        {/each}
                      </div>
                      <!-- Rows -->
                      <div class="tl-rows">
                        {#each tl.items as it, idx (it.id)}
                          <div
                            class="tl-row"
                            class:alt={idx % 2 === 1}
                            on:click={() => selById(res.spec, it.id)}
                            role="button"
                          >
                            <div class="tl-name" style="width:{LEFT_W}px">
                              <StatusDot status={it.status} size={7} />
                              <span class="tl-name-text" title={it.name}>{it.name}</span>
                            </div>
                            <div class="tl-track" style="width:{tl.width}px">
                              <div
                                class="tl-bar"
                                class:cancelled={it.cancelled}
                                style="left:{tlBarLeft(it, tl.min)}px;width:{tlBarWidth(it, tl.min)}px;background:{it.color}"
                                title="{it.name} · {fmtDate(it.start)} – {fmtDate(it.end)} · {it.progress}% done"
                              >
                                <div class="tl-bar-fill" style="width:{it.progress}%"></div>
                                <span class="tl-bar-label">{it.name}</span>
                              </div>
                            </div>
                          </div>
                        {/each}
                      </div>
                    </div>
                  </div>
                </div>
              {/if}
            {/if}
          </div>
        </article>
      {/each}
    </div>
  {/if}
</div>

{#if pendingDeleteWidget}
  <ConfirmModal
    title="Remove widget"
    message={`Remove the widget "${pendingDeleteWidget.title}"? This cannot be undone.`}
    confirmLabel="Remove"
    on:confirm={doRemoveWidget}
    on:cancel={cancelRemoveWidget}
  />
{/if}

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
  .ghost-btn.primary {
    background: var(--pm-accent, #007aff);
    color: #fff;
    border-color: var(--pm-accent, #007aff);
  }
  .ghost-btn:hover {
    background: var(--pm-hover, rgba(0, 0, 0, 0.04));
  }
  .ghost-btn.primary:hover {
    background: #006fe8;
  }

  /* ---- Editor ---- */
  .editor {
    margin: 0 22px 12px;
    padding: 14px;
    background: var(--pm-surface, #fff);
    border: 1px solid var(--pm-border, rgba(0, 0, 0, 0.1));
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex-shrink: 0;
  }
  .editor-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .editor-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--pm-text, #1d1d1f);
  }
  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
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

  /* ---- Empty state ---- */
  .empty-board {
    margin: 0 22px;
    padding: 40px 20px;
    text-align: center;
    color: var(--pm-muted, #8e8e93);
    font-size: 13px;
    border: 1.5px dashed var(--pm-border, rgba(0, 0, 0, 0.1));
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    align-items: center;
  }

  /* ---- Dashboard grid ---- */
  .grid {
    flex: 1;
    overflow-y: auto;
    padding: 0 22px 22px;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
    align-content: start;
  }
  .card {
    grid-column: span var(--span, 2);
    background: var(--pm-surface, #fff);
    border: 1px solid var(--pm-border, rgba(0, 0, 0, 0.07));
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    min-height: 220px;
    overflow: hidden;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
  }
  .card-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--pm-border, rgba(0, 0, 0, 0.06));
    flex-shrink: 0;
  }
  .card-title {
    flex: 1;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--pm-text, #1d1d1f);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .card-badge {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--pm-muted, #8e8e93);
    background: var(--pm-col, rgba(0, 0, 0, 0.04));
    padding: 2px 7px;
    border-radius: 999px;
    font-weight: 600;
  }
  .card-tools {
    display: flex;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.12s;
  }
  .card:hover .card-tools {
    opacity: 1;
  }
  .tool {
    border: none;
    background: transparent;
    color: var(--pm-muted, #8e8e93);
    width: 22px;
    height: 22px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .tool:hover:not(:disabled) {
    background: var(--pm-hover, rgba(0, 0, 0, 0.06));
    color: var(--pm-text, #1d1d1f);
  }
  .tool:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  .tool.danger:hover {
    background: rgba(255, 59, 48, 0.12);
    color: #ff3b30;
  }
  .card-body {
    flex: 1;
    overflow: auto;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .muted {
    color: var(--pm-muted, #8e8e93);
    font-size: 12px;
    text-align: center;
    padding: 20px 0;
    margin: 0;
  }
  .qerr {
    padding: 10px 12px;
    background: rgba(255, 59, 48, 0.08);
    border: 1px solid rgba(255, 59, 48, 0.25);
    border-radius: 9px;
    color: #ff3b30;
    font-size: 12px;
  }
  .qerr p {
    margin: 4px 0 8px;
  }

  /* ---- Table ---- */
  .table-wrap {
    flex: 1;
    overflow: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  thead th {
    text-align: left;
    padding: 7px 9px;
    border-bottom: 1px solid var(--pm-border, rgba(0, 0, 0, 0.1));
    font-size: 10.5px;
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
    padding: 6px 9px;
    border-bottom: 1px solid var(--pm-border, rgba(0, 0, 0, 0.05));
    color: var(--pm-text, #1d1d1f);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 180px;
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

  /* ---- List ---- */
  .list-wrap {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .list-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    text-align: left;
    border: none;
    background: transparent;
    padding: 6px 8px;
    border-radius: 7px;
    cursor: pointer;
    font-size: 12.5px;
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

  /* ---- Kanban ---- */
  .kanban {
    flex: 1;
    display: flex;
    gap: 8px;
    overflow-x: auto;
    align-items: stretch;
    min-height: 0;
    padding-bottom: 4px;
  }
  .kb-col {
    flex: 0 0 190px;
    background: var(--pm-col, rgba(0, 0, 0, 0.025));
    border: 1px solid transparent;
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    min-height: 0;
    transition: background 0.12s, border-color 0.12s;
  }
  .kb-col.kb-drop {
    border-color: var(--pm-accent, #007aff);
    background: color-mix(in srgb, var(--pm-accent, #007aff) 8%, transparent);
  }
  .kb-head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 9px 10px 6px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--pm-text, #1d1d1f);
    text-transform: capitalize;
  }
  .kb-head .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .kb-label {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .kb-head .count {
    font-size: 10px;
    color: var(--pm-muted, #8e8e93);
    background: var(--pm-surface, #fff);
    padding: 1px 6px;
    border-radius: 999px;
    font-variant-numeric: tabular-nums;
  }
  .kb-body {
    flex: 1;
    overflow-y: auto;
    padding: 4px 6px 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 60px;
  }
  .kb-card {
    background: var(--pm-surface, #fff);
    border: 1px solid var(--pm-border, rgba(0, 0, 0, 0.07));
    border-radius: 9px;
    padding: 8px 10px;
    cursor: grab;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
    text-align: left;
    flex: 0 0 auto;
    user-select: none;
  }
  .kb-card:hover {
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.08);
  }
  .kb-card:active {
    cursor: grabbing;
  }
  .kb-card.active {
    border-color: var(--pm-accent, #007aff);
    box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.15);
  }
  .kb-card.kb-dragging {
    opacity: 0.4;
    transform: rotate(1.5deg);
  }
  .kc-top {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .kc-name {
    flex: 1;
    font-size: 12px;
    font-weight: 600;
    color: var(--pm-text, #1d1d1f);
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .kc-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 5px;
    flex-wrap: wrap;
  }
  .kc-prio {
    display: inline-block;
    font-size: 9.5px;
    font-weight: 600;
    color: var(--c);
    padding: 1px 6px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--c) 14%, transparent);
  }
  .kc-due {
    font-size: 10px;
    color: var(--pm-muted, #8e8e93);
    font-variant-numeric: tabular-nums;
    margin-left: auto;
  }
  .kc-foot {
    margin-top: 6px;
    display: flex;
    justify-content: flex-end;
  }
  .kb-empty {
    text-align: center;
    color: var(--pm-muted, #8e8e93);
    font-size: 10.5px;
    padding: 14px 6px;
    border: 1.5px dashed var(--pm-border, rgba(0, 0, 0, 0.1));
    border-radius: 8px;
  }
  .kb-col.kb-drop .kb-empty {
    border-color: var(--pm-accent, #007aff);
    color: var(--pm-accent, #007aff);
  }

  /* ---- Pie / donut ---- */
  .chart-row {
    display: flex;
    gap: 12px;
    align-items: center;
    flex: 1;
    min-height: 0;
  }
  .pie-svg {
    flex: 0 0 110px;
    width: 110px;
    height: 110px;
  }
  .pie-center-num {
    font-size: 16px;
    font-weight: 700;
    fill: var(--pm-text, #1d1d1f);
  }
  .pie-center-lbl {
    font-size: 7px;
    fill: var(--pm-muted, #8e8e93);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .legend {
    flex: 1;
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow-y: auto;
    min-width: 0;
  }
  .legend li {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    color: var(--pm-text, #1d1d1f);
  }
  .lg-dot {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    flex-shrink: 0;
  }
  .lg-key {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .lg-num {
    font-variant-numeric: tabular-nums;
    color: var(--pm-text, #1d1d1f);
    font-weight: 600;
  }
  .lg-pct {
    color: var(--pm-muted, #8e8e93);
    font-variant-numeric: tabular-nums;
    min-width: 32px;
    text-align: right;
  }

  /* ---- Bar ---- */
  .bar-list {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow-y: auto;
  }
  .bar-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11.5px;
  }
  .bar-key {
    flex: 0 0 80px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--pm-text, #1d1d1f);
  }
  .bar-track {
    flex: 1;
    height: 14px;
    background: var(--pm-col, rgba(0, 0, 0, 0.04));
    border-radius: 7px;
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    border-radius: 7px;
    transition: width 0.3s;
  }
  .bar-num {
    font-variant-numeric: tabular-nums;
    color: var(--pm-text, #1d1d1f);
    font-weight: 600;
    min-width: 24px;
    text-align: right;
  }

  /* ---- Metric ---- */
  .metric {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
  }
  .metric-value {
    font-size: 40px;
    font-weight: 700;
    color: var(--pm-accent, #007aff);
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .metric-label {
    font-size: 11px;
    color: var(--pm-muted, #8e8e93);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* ---- Progress ring ---- */
  .progress-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
  .progress-svg {
    width: 130px;
    height: 130px;
  }
  .progress-num {
    font-size: 18px;
    font-weight: 700;
    fill: var(--pm-text, #1d1d1f);
  }
  .progress-lbl {
    font-size: 8px;
    fill: var(--pm-muted, #8e8e93);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .progress-caption {
    font-size: 11px;
    color: var(--pm-muted, #8e8e93);
    margin: 0;
  }

  /* ---- Responsive: collapse to 2 columns on narrow viewports ---- */
  @media (max-width: 900px) {
    .grid {
      grid-template-columns: repeat(2, 1fr);
    }
    .card {
      grid-column: span min(var(--span, 2), 2);
    }
  }

  /* ---- Drag handle & drag-and-drop visual feedback ---- */
  .drag-handle {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--pm-muted, #8e8e93);
    cursor: grab;
    font-size: 14px;
    line-height: 1;
    opacity: 0.4;
    transition: opacity 0.12s, color 0.12s;
    user-select: none;
  }
  .card:hover .drag-handle {
    opacity: 0.85;
  }
  .drag-handle:hover {
    color: var(--pm-text, #1d1d1f);
  }
  .drag-handle:active {
    cursor: grabbing;
  }
  .card.dragging {
    opacity: 0.4;
    transform: scale(0.98);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
  }
  .card.drop-target {
    outline: 2px dashed var(--pm-accent, #007aff);
    outline-offset: -2px;
    background: color-mix(in srgb, var(--pm-accent, #007aff) 6%, var(--pm-surface, #fff));
  }

  /* ---- Timeline widget (Jira plan-style) ---- */
  .tl {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .tl-scroll {
    flex: 1;
    overflow: auto;
    border: 1px solid var(--pm-border, rgba(0, 0, 0, 0.06));
    border-radius: 9px;
    background: var(--pm-col, rgba(0, 0, 0, 0.015));
    min-height: 0;
    position: relative;
  }
  .tl-canvas {
    position: relative;
    min-width: 100%;
  }
  /* Header: sticky top; corner also sticky left. */
  .tl-head {
    position: sticky;
    top: 0;
    z-index: 5;
    height: 30px;
    display: flex;
    align-items: stretch;
    background: var(--pm-surface, #fff);
    border-bottom: 1px solid var(--pm-border, rgba(0, 0, 0, 0.12));
  }
  .tl-corner {
    position: sticky;
    left: 0;
    z-index: 6;
    width: 200px;
    flex: 0 0 200px;
    display: flex;
    align-items: center;
    padding: 0 12px;
    font-size: 10.5px;
    font-weight: 600;
    color: var(--pm-muted, #8e8e93);
    text-transform: uppercase;
    letter-spacing: 0.4px;
    background: var(--pm-surface, #fff);
    border-right: 1px solid var(--pm-border, rgba(0, 0, 0, 0.12));
  }
  .tl-axis {
    position: relative;
    flex: 0 0 auto;
  }
  .tl-month {
    position: absolute;
    top: 0;
    height: 30px;
    padding: 8px 8px 0;
    font-size: 10.5px;
    font-weight: 600;
    color: var(--pm-muted, #8e8e93);
    text-transform: uppercase;
    letter-spacing: 0.4px;
    white-space: nowrap;
    overflow: hidden;
    border-right: 1px solid var(--pm-border, rgba(0, 0, 0, 0.08));
  }
  /* Today indicator: vertical red line over the whole canvas. */
  .tl-today {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #ff3b30;
    opacity: 0.55;
    z-index: 3;
    pointer-events: none;
  }
  /* Vertical gridlines (weeks faint, months stronger) behind rows. */
  .tl-grid {
    position: absolute;
    top: 30px;
    bottom: 0;
    z-index: 0;
    pointer-events: none;
  }
  .tl-weekline {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--pm-border, rgba(0, 0, 0, 0.04));
  }
  .tl-monthline {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--pm-border, rgba(0, 0, 0, 0.1));
  }
  .tl-rows {
    position: relative;
  }
  .tl-row {
    display: flex;
    align-items: stretch;
    height: 34px;
    cursor: pointer;
    border-bottom: 1px solid var(--pm-border, rgba(0, 0, 0, 0.04));
  }
  .tl-row.alt {
    background: rgba(0, 0, 0, 0.018);
  }
  .tl-row:hover {
    background: var(--pm-hover, rgba(0, 122, 255, 0.05));
  }
  /* Sticky name column (left). */
  .tl-name {
    position: sticky;
    left: 0;
    z-index: 4;
    flex: 0 0 200px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    background: var(--pm-surface, #fff);
    border-right: 1px solid var(--pm-border, rgba(0, 0, 0, 0.12));
  }
  .tl-row.alt .tl-name {
    background: var(--pm-col, rgba(0, 0, 0, 0.018));
  }
  .tl-row:hover .tl-name {
    background: color-mix(in srgb, var(--pm-accent, #007aff) 6%, var(--pm-surface, #fff));
  }
  .tl-name-text {
    flex: 1;
    font-size: 11.5px;
    font-weight: 500;
    color: var(--pm-text, #1d1d1f);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tl-track {
    position: relative;
    flex: 0 0 auto;
  }
  .tl-bar {
    position: absolute;
    top: 5px;
    height: 24px;
    border-radius: 6px;
    color: #fff;
    padding: 4px 8px;
    font-size: 10.5px;
    font-weight: 600;
    line-height: 16px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
    opacity: 0.92;
    overflow: hidden;
  }
  .tl-bar:hover {
    opacity: 1;
    box-shadow: 0 3px 9px rgba(0, 0, 0, 0.2);
  }
  .tl-bar.cancelled {
    opacity: 0.5;
    background: repeating-linear-gradient(
      45deg,
      var(--pm-muted, #8e8e93),
      var(--pm-muted, #8e8e93) 5px,
      rgba(255, 255, 255, 0.35) 5px,
      rgba(255, 255, 255, 0.35) 10px
    ) !important;
  }
  /* Progress fill (darker overlay on the left portion = done). */
  .tl-bar-fill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.28);
    border-radius: 6px 0 0 6px;
    pointer-events: none;
  }
  .tl-bar-label {
    position: relative;
    z-index: 1;
    pointer-events: none;
  }
</style>
