<script lang="ts">
  import type PmStore from "../store";
  import Sidebar from "./Sidebar.svelte";
  import Overview from "./Overview.svelte";
  import Timeline from "./Timeline.svelte";
  import Board from "./Board.svelte";
  import Requirements from "./Requirements.svelte";
  import DetailPanel from "./DetailPanel.svelte";
  import EditorModal from "./EditorModal.svelte";

  export let store: PmStore;

  const model = store.model;
  const tab = store.tab;
  const selection = store.selection;
  const loading = store.loading;
  const error = store.error;
  const editor = store.editor;
  const solutions = store.solutions;
  const activeSlug = store.activeSlug;

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "timeline", label: "Timeline" },
    { id: "board", label: "Board" },
    { id: "requirements", label: "Requirements" },
  ] as const;

  $: solutionName = $model.solution.name || $solutions.find((s) => s.slug === $activeSlug)?.name || "Project Manager";
  $: hasSolution = !!$model.solution.id;

  function switchSolution(e: Event) {
    const slug = (e.target as HTMLSelectElement).value;
    store.setActiveSolution(slug);
  }
</script>

<div class="pm-app">
  <header class="topbar">
    <div class="brand">
      <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M3 5a2 2 0 0 1 2-2h4v9H3zm0 9h6v7H5a2 2 0 0 1-2-2zm8-11h8a2 2 0 0 1 2 2v7h-10zm0 9h10v5a2 2 0 0 1-2 2h-8z"/></svg>
      <div class="brand-text">
        <div class="brand-title">{solutionName}</div>
        <div class="brand-sub">{$model.projects.length} projects · {$model.tasks.length} tasks</div>
      </div>
      {#if $solutions.length > 1}
        <select class="sol-switch" value={$activeSlug} on:change={switchSolution}>
          {#each $solutions as s}
            <option value={s.slug}>{s.name}</option>
          {/each}
        </select>
      {/if}
    </div>

    <nav class="tabs">
      {#each tabs as t}
        <button class:active={$tab === t.id} on:click={() => store.setTab(t.id)}>{t.label}</button>
      {/each}
    </nav>

    <div class="topbar-actions">
      <button class="ghost" on:click={() => store.openEditor({ mode: "edit", kind: "solution", entity: $model.solution })} title="Solution settings">
        <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19.14 12.94a2 2 0 0 0-1.41-1.41l-5.96-.94a6.96 6.96 0 0 0-1.21 1.21l-.94 5.96a2 2 0 0 0 1.41 1.41l5.96.94a6.96 6.96 0 0 0 1.21-1.21l.94-5.96zM12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z"/></svg>
      </button>
      {#if $tab === "overview"}
        <button class="primary" on:click={() => store.openEditor({ mode: "create", kind: "project" })}>+ New project</button>
      {:else if $tab === "requirements"}
        <button class="primary" on:click={() => store.openEditor({ mode: "create", kind: "requirement" })}>+ New requirement</button>
      {/if}
    </div>
  </header>

  <div class="body">
    <Sidebar {store} />

    <main class="main">
      {#if $error}
        <div class="banner">{$error}</div>
      {/if}
      {#if !hasSolution && !$loading}
        <div class="setup">
          <svg viewBox="0 0 24 24" width="44" height="44"><path fill="currentColor" opacity="0.5" d="M3 5a2 2 0 0 1 2-2h4v9H3zm0 9h6v7H5a2 2 0 0 1-2-2zm8-11h8a2 2 0 0 1 2 2v7h-10zm0 9h10v5a2 2 0 0 1-2 2h-8z"/></svg>
          <h2>Welcome to Project Manager</h2>
          <p>No solution folder found. Create a demo solution to explore the app, or set the “Solutions folder” in settings.</p>
          <button class="primary" on:click={() => store.ensureDefaultSolution().then(() => store.refreshSolutions())}>Create demo solution</button>
        </div>
      {:else if $loading && !hasSolution}
        <div class="loading">Loading…</div>
      {:else}
        <div class="content">
          {#if $tab === "overview"}
            <Overview {store} />
          {:else if $tab === "timeline"}
            <Timeline {store} />
          {:else if $tab === "board"}
            <Board {store} />
          {:else if $tab === "requirements"}
            <Requirements {store} />
          {/if}
        </div>
      {/if}
    </main>

    <DetailPanel {store} />
  </div>

  {#if $editor}
    <EditorModal
      {store}
      mode={$editor.mode}
      kind={$editor.kind}
      entity={$editor.entity ?? null}
      projectId={$editor.projectId}
      targetId={$editor.targetId}
      on:close={() => store.closeEditor()}
    />
  {/if}
</div>

<style>
  .pm-app {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--pm-bg, #f5f5f7);
    color: var(--pm-text, #1d1d1f);
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif;
  }
  .topbar {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 10px 18px;
    background: var(--pm-surface, rgba(255, 255, 255, 0.85));
    backdrop-filter: saturate(180%) blur(20px);
    -webkit-backdrop-filter: saturate(180%) blur(20px);
    border-bottom: 1px solid var(--pm-border, rgba(0, 0, 0, 0.08));
    flex-shrink: 0;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--pm-accent, #007aff);
    min-width: 0;
  }
  .brand-text {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
  }
  .brand-title {
    font-size: 14px;
    font-weight: 650;
    color: var(--pm-text, #1d1d1f);
    letter-spacing: -0.2px;
  }
  .brand-sub {
    font-size: 11px;
    color: var(--pm-muted, #8e8e93);
  }
  .sol-switch {
    font: inherit;
    font-size: 11.5px;
    padding: 4px 8px;
    border: 1px solid var(--pm-border, rgba(0, 0, 0, 0.12));
    border-radius: 7px;
    background: var(--pm-input, #fff);
    color: var(--pm-text, #1d1d1f);
    margin-left: 6px;
  }
  .tabs {
    display: flex;
    gap: 2px;
    margin: 0 auto;
    background: var(--pm-col, rgba(0, 0, 0, 0.05));
    border-radius: 10px;
    padding: 3px;
  }
  .tabs button {
    border: none;
    background: transparent;
    font: inherit;
    font-size: 13px;
    font-weight: 500;
    color: var(--pm-muted, #8e8e93);
    padding: 6px 16px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .tabs button:hover {
    color: var(--pm-text, #1d1d1f);
  }
  .tabs button.active {
    background: var(--pm-surface, #fff);
    color: var(--pm-text, #1d1d1f);
    font-weight: 600;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  }
  .topbar-actions {
    margin-left: auto;
  }
  .primary {
    background: var(--pm-accent, #007aff);
    color: #fff;
    border: none;
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    padding: 7px 14px;
    border-radius: 9px;
    cursor: pointer;
  }
  .primary:hover {
    background: #006fe8;
  }
  .ghost {
    background: transparent;
    border: none;
    color: var(--pm-muted, #8e8e93);
    padding: 7px;
    border-radius: 9px;
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
  }
  .ghost:hover {
    color: var(--pm-text, #1d1d1f);
    background: var(--pm-col, rgba(0, 0, 0, 0.05));
  }
  .body {
    flex: 1;
    display: grid;
    grid-template-columns: 280px 1fr 320px;
    min-height: 0;
  }
  .main {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .content {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .content :global(.overview),
  .content :global(.timeline),
  .content :global(.board),
  .content :global(.req) {
    height: 100%;
  }
  .banner {
    margin: 12px 22px;
    padding: 10px 14px;
    background: rgba(255, 59, 48, 0.1);
    color: #ff3b30;
    border-radius: 10px;
    font-size: 13px;
  }
  .loading,
  .setup {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    color: var(--pm-muted, #8e8e93);
    padding: 40px;
    text-align: center;
  }
  .setup h2 {
    margin: 0;
    color: var(--pm-text, #1d1d1f);
    font-size: 20px;
    font-weight: 650;
  }
  .setup p {
    margin: 0;
    max-width: 420px;
    font-size: 13px;
    line-height: 1.5;
  }
</style>
