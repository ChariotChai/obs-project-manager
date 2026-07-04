<script lang="ts">
  import type PmStore from "../store";
  import type { Project, Target, Task } from "../types";
  import StatusDot from "./components/StatusDot.svelte";

  export let store: PmStore;
  const model = store.model;
  const selection = store.selection;

  let showTasks = false;
  const DAY = 26; // px per day

  type Row = {
    kind: "project" | "target" | "task";
    id: string;
    name: string;
    start?: string;
    end?: string;
    color?: string;
    status: string;
    depth: number;
    owner?: string;
    parentId?: string;
  };

  $: rows = buildRows();

  function buildRows(): Row[] {
    if (!$model) return [];
    const out: Row[] = [];
    for (const p of $model.projects) {
      out.push({ kind: "project", id: p.id, name: p.name, start: p.startDate, end: p.endDate, color: p.color, status: p.status, depth: 0, owner: p.owner });
      const targets = $model.targets.filter((t) => t.projectId === p.id);
      for (const t of targets) {
        out.push({ kind: "target", id: t.id, name: t.name, start: t.startDate, end: t.endDate, color: p.color, status: t.status, depth: 1, owner: t.owner, parentId: p.id });
        if (showTasks) {
          const tasks = $model.tasks.filter((k) => k.targetId === t.id);
          for (const k of tasks) {
            out.push({ kind: "task", id: k.id, name: k.name, start: k.startDate, end: k.dueDate, color: p.color, status: k.status, depth: 2, owner: k.owner, parentId: t.id });
          }
        }
      }
    }
    return out;
  }

  $: dated = rows.filter((r) => r.start || r.end);

  $: range = (() => {
    let min = Infinity;
    let max = -Infinity;
    for (const r of dated) {
      const s = r.start ? toTime(r.start) : Infinity;
      const e = r.end ? toTime(r.end) : -Infinity;
      if (s < min) min = s;
      if (e > max) max = e;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      const now = Date.now();
      min = now - 14 * 86400000;
      max = now + 30 * 86400000;
    }
    min = floorToDay(min) - 2 * 86400000;
    max = ceilToDay(max) + 2 * 86400000;
    return { min, max, days: Math.max(1, Math.round((max - min) / 86400000)) };
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

  $: totalWidth = range ? range.days * DAY : 0;

  function left(t: number): number {
    if (!range) return 0;
    return ((t - range.min) / 86400000) * DAY;
  }
  function barStyle(r: Row): string {
    if (!range) return "left:0px;width:0px";
    const s = r.start ? toTime(r.start) : r.end ? toTime(r.end) - 86400000 : range.min;
    const e = r.end ? toTime(r.end) : r.start ? toTime(r.start) + 86400000 : range.min + 86400000;
    const l = left(s);
    const w = Math.max(DAY, ((e - s) / 86400000) * DAY);
    return `left:${l}px;width:${w}px`;
  }

  // Build month/week headers
  $: headers = (() => {
    if (!range) return [];
    const months: { label: string; left: number; width: number }[] = [];
    let cursor = range.min;
    while (cursor < range.max) {
      const d = new Date(cursor);
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
      const start = Math.max(cursor, monthStart);
      const end = Math.min(range.max, next);
      months.push({
        label: d.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
        left: left(start),
        width: ((end - start) / 86400000) * DAY,
      });
      cursor = next;
    }
    return months;
  })();

  $: todayLeft = left(floorToDay(Date.now()));

  function sel(r: Row) {
    store.select(r.kind, r.id);
  }
</script>

<div class="timeline">
  <div class="tl-head">
    <h2>Timeline</h2>
    <label class="toggle">
      <input type="checkbox" bind:checked={showTasks} />
      <span>Show tasks</span>
    </label>
  </div>

  {#if rows.length === 0}
    <p class="muted">No projects with dates yet. Add start/end dates to projects and targets to see them on the timeline.</p>
  {:else}
    <div class="tl-scroll">
      <div class="tl-grid" style="width:{totalWidth}px">
        <!-- header -->
        <div class="tl-months">
          {#each headers as m}
            <div class="month" style="left:{m.left}px;width:{m.width}px">{m.label}</div>
          {/each}
        </div>
        <div class="tl-weeks">
          {#each range ? Array(range.days) : [] as _, i}
            <div class="day" class:weekend={range ? new Date(range.min + i * 86400000).getDay() % 6 === 0 : false}></div>
          {/each}
        </div>

        <!-- today marker -->
        <div class="today" style="left:{todayLeft}px"></div>

        <!-- rows -->
        <div class="tl-rows">
          {#each rows as r (r.kind + r.id)}
            <div
              class="tl-row"
              class:active={$selection.kind === r.kind && $selection.id === r.id}
              style="padding-left:{r.depth * 18}px"
              on:click={() => sel(r)}
            >
              <div class="tl-label">
                <span class="bar" style="background:{r.color}"></span>
                <span class="name">{r.name}</span>
                <StatusDot status={r.status} size={6} />
              </div>
              {#if r.start || r.end}
                <div class="tl-bar track" style={barStyle(r)}>
                  <span class="bar-fill" style="--c:{r.color}"></span>
                  {#if r.owner}
                    <span class="bar-owner">{r.owner}</span>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .timeline {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .tl-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 22px 10px;
  }
  .tl-head h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--pm-muted, #8e8e93);
    cursor: pointer;
  }
  .muted {
    color: var(--pm-muted, #8e8e93);
    padding: 20px 26px;
    font-size: 13px;
  }
  .tl-scroll {
    flex: 1;
    overflow: auto;
    padding: 0 22px 20px;
  }
  .tl-grid {
    position: relative;
    min-width: 100%;
  }
  .tl-months {
    position: relative;
    height: 26px;
    border-bottom: 1px solid var(--pm-border, rgba(0, 0, 0, 0.06));
  }
  .month {
    position: absolute;
    top: 6px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--pm-muted, #8e8e93);
    padding-left: 6px;
    border-left: 1px solid var(--pm-border, rgba(0, 0, 0, 0.06));
    white-space: nowrap;
    overflow: hidden;
  }
  .tl-weeks {
    position: relative;
    height: 22px;
    display: flex;
    border-bottom: 1px solid var(--pm-border, rgba(0, 0, 0, 0.06));
  }
  .day {
    flex: 0 0 auto;
    width: 26px;
    border-right: 1px solid var(--pm-border, rgba(0, 0, 0, 0.04));
  }
  .day.weekend {
    background: rgba(0, 0, 0, 0.02);
  }
  .today {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #ff3b30;
    opacity: 0.5;
    z-index: 2;
  }
  .tl-rows {
    position: relative;
  }
  .tl-row {
    position: relative;
    height: 38px;
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--pm-border, rgba(0, 0, 0, 0.04));
    cursor: pointer;
  }
  .tl-row:hover {
    background: var(--pm-hover, rgba(0, 0, 0, 0.02));
  }
  .tl-row.active {
    background: color-mix(in srgb, var(--pm-accent, #007aff) 8%, transparent);
  }
  .tl-label {
    position: sticky;
    left: 0;
    z-index: 3;
    display: flex;
    align-items: center;
    gap: 7px;
    background: var(--pm-surface, #fff);
    padding: 0 12px 0 6px;
    min-width: 200px;
    height: 100%;
    font-size: 12.5px;
    color: var(--pm-text, #1d1d1f);
  }
  .bar {
    width: 3px;
    height: 14px;
    border-radius: 3px;
  }
  .name {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 260px;
  }
  .tl-bar {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    height: 18px;
    border-radius: 6px;
    overflow: hidden;
    display: flex;
    align-items: center;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
  }
  .bar-fill {
    position: absolute;
    inset: 0;
    background: var(--c, #007aff);
    opacity: 0.85;
  }
  .bar-owner {
    position: relative;
    z-index: 1;
    font-size: 10.5px;
    color: #fff;
    padding: 0 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 600;
  }
</style>
