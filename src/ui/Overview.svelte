<script lang="ts">
  import type PmStore from "../store";
  import { statsFor } from "../store";
  import Progress from "./components/Progress.svelte";
  import StatusDot from "./components/StatusDot.svelte";
  import Avatar from "./components/Avatar.svelte";
  import { statusLabel } from "../constants";

  export let store: PmStore;
  const model = store.model;

  $: stats = statsFor($model);

  $: byOwner = (() => {
    const map = new Map<string, { total: number; done: number }>();
    for (const t of $model.tasks) {
      if (!t.owner) continue;
      const e = map.get(t.owner) ?? { total: 0, done: 0 };
      e.total++;
      if (t.status === "done") e.done++;
      map.set(t.owner, e);
    }
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  })();

  function projectDone(id: string) {
    const ts = $model.tasks.filter((t) => t.projectId === id);
    if (!ts.length) return 0;
    return Math.round((ts.filter((t) => t.status === "done").length / ts.length) * 100);
  }
  function projectTasks(id: string) {
    return $model.tasks.filter((t) => t.projectId === id).length;
  }
  function fmtDate(d?: string) {
    if (!d) return "—";
    try {
      return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch {
      return d;
    }
  }
</script>

<div class="overview">
  <div class="cards">
    <div class="card">
      <div class="k">{stats.projects}</div>
      <div class="lbl">Projects</div>
    </div>
    <div class="card">
      <div class="k">{stats.tasksDone}<span class="sub">/{stats.tasksTotal}</span></div>
      <div class="lbl">Tasks done</div>
    </div>
    <div class="card accent">
      <div class="k">{stats.completion}%</div>
      <div class="lbl">Overall completion</div>
    </div>
    <div class="card warn">
      <div class="k">{stats.blocked}</div>
      <div class="lbl">Blocked</div>
    </div>
    <div class="card danger">
      <div class="k">{stats.overdue}</div>
      <div class="lbl">Overdue</div>
    </div>
    <div class="card">
      <div class="k">{stats.poolReqs}</div>
      <div class="lbl">In requirement pool</div>
    </div>
  </div>

  <div class="cols">
    <section class="panel">
      <div class="panel-head">
        <h2>Project progress</h2>
        <button class="ghost-btn" on:click={() => store.openEditor({ mode: "create", kind: "project" })}>+ Project</button>
      </div>
      <div class="panel-body">
        {#if $model.projects.length === 0}
          <p class="muted">No projects yet. Create your first project to get started.</p>
        {:else}
          {#each $model.projects as p (p.id)}
            <button
              class="proj-row"
              on:click={() => store.select("project", p.id)}
            >
              <div class="proj-top">
                <span class="proj-name"><span class="bar" style="background:{p.color}"></span>{p.name}</span>
                <span class="proj-meta">
                  <StatusDot status={p.status} size={7} />
                  {statusLabel(p.status)}
                  · {projectTasks(p.id)} tasks
                </span>
              </div>
              <Progress value={projectDone(p.id)} label={`${projectDone(p.id)}%`} />
              <div class="proj-foot">
                <span>{p.owner ? p.owner : "Unassigned"}</span>
                <span>{fmtDate(p.startDate)} – {fmtDate(p.endDate)}</span>
              </div>
            </button>
          {/each}
        {/if}
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>Workload by owner</h2>
      </div>
      <div class="panel-body">
        {#if byOwner.length === 0}
          <p class="muted">No assigned tasks yet.</p>
        {:else}
          {#each byOwner as [owner, e] (owner)}
            <div class="owner-row">
              <Avatar name={owner} size={28} />
              <div class="owner-info">
                <div class="owner-top">
                  <span class="owner-name">{owner}</span>
                  <span class="owner-num">{e.done}/{e.total}</span>
                </div>
                <Progress value={e.total ? (e.done / e.total) * 100 : 0} />
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </section>
  </div>
</div>

<style>
  .overview {
    padding: 22px 26px;
    overflow-y: auto;
    height: 100%;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px;
    margin-bottom: 20px;
  }
  .card {
    background: var(--pm-surface, #fff);
    border: 1px solid var(--pm-border, rgba(0, 0, 0, 0.07));
    border-radius: 14px;
    padding: 16px 18px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
  }
  .k {
    font-size: 28px;
    font-weight: 700;
    color: var(--pm-text, #1d1d1f);
    line-height: 1.1;
    letter-spacing: -0.5px;
  }
  .k .sub {
    font-size: 16px;
    color: var(--pm-muted, #8e8e93);
    font-weight: 500;
  }
  .lbl {
    font-size: 12px;
    color: var(--pm-muted, #8e8e93);
    margin-top: 4px;
    font-weight: 500;
  }
  .card.accent .k {
    color: #007aff;
  }
  .card.warn .k {
    color: #ff9f0a;
  }
  .card.danger .k {
    color: #ff3b30;
  }
  .cols {
    display: grid;
    grid-template-columns: 1.4fr 1fr;
    gap: 14px;
  }
  .panel {
    background: var(--pm-surface, #fff);
    border: 1px solid var(--pm-border, rgba(0, 0, 0, 0.07));
    border-radius: 14px;
    overflow: hidden;
  }
  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    border-bottom: 1px solid var(--pm-border, rgba(0, 0, 0, 0.06));
  }
  .panel-head h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }
  .panel-body {
    padding: 8px;
  }
  .muted {
    color: var(--pm-muted, #8e8e93);
    font-size: 13px;
    padding: 14px;
    margin: 0;
  }
  .ghost-btn {
    border: 1px solid var(--pm-border, rgba(0, 0, 0, 0.12));
    background: transparent;
    color: var(--pm-accent, #007aff);
    font-size: 12px;
    font-weight: 600;
    padding: 5px 10px;
    border-radius: 8px;
    cursor: pointer;
  }
  .ghost-btn:hover {
    background: var(--pm-hover, rgba(0, 0, 0, 0.04));
  }
  .proj-row {
    display: block;
    width: 100%;
    text-align: left;
    border: none;
    background: transparent;
    padding: 10px 12px;
    border-radius: 10px;
    cursor: pointer;
  }
  .proj-row:hover {
    background: var(--pm-hover, rgba(0, 0, 0, 0.03));
  }
  .proj-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .proj-name {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--pm-text, #1d1d1f);
  }
  .bar {
    width: 3px;
    height: 14px;
    border-radius: 3px;
  }
  .proj-meta {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11.5px;
    color: var(--pm-muted, #8e8e93);
  }
  .proj-foot {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: var(--pm-muted, #8e8e93);
    margin-top: 6px;
  }
  .owner-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 12px;
    border-radius: 10px;
  }
  .owner-row:hover {
    background: var(--pm-hover, rgba(0, 0, 0, 0.03));
  }
  .owner-info {
    flex: 1;
  }
  .owner-top {
    display: flex;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .owner-name {
    font-size: 13px;
    font-weight: 500;
  }
  .owner-num {
    font-size: 12px;
    color: var(--pm-muted, #8e8e93);
    font-variant-numeric: tabular-nums;
  }
</style>
