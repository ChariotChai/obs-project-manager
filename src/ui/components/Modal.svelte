<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from "svelte";
  export let title = "";
  export let width = 520;

  const dispatch = createEventDispatcher();
  let root: HTMLElement;

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") dispatch("close");
  }

  onMount(() => {
    document.addEventListener("keydown", onKey);
    // focus first input
    queueMicrotask(() => {
      const el = root.querySelector<HTMLElement>("input, textarea, select, button");
      el?.focus();
    });
  });
  onDestroy(() => document.removeEventListener("keydown", onKey));
</script>

<div class="pm-overlay" on:click|self={() => dispatch("close")} role="presentation">
  <div class="pm-modal" style="max-width:{width}px" bind:this={root} role="dialog" aria-modal="true">
    <div class="pm-modal-head">
      <h3>{title}</h3>
      <button class="pm-x" on:click={() => dispatch("close")} aria-label="Close">×</button>
    </div>
    <div class="pm-modal-body">
      <slot />
    </div>
    <div class="pm-modal-foot">
      <slot name="footer" />
    </div>
  </div>
</div>

<style>
  .pm-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.28);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    animation: pm-fade 0.16s ease;
  }
  .pm-modal {
    width: 100%;
    background: var(--pm-surface, #fff);
    border-radius: 16px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.22), 0 2px 8px rgba(0, 0, 0, 0.08);
    overflow: hidden;
    max-height: 88vh;
    display: flex;
    flex-direction: column;
    animation: pm-pop 0.18s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .pm-modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 22px 10px;
  }
  .pm-modal-head h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
  .pm-x {
    border: none;
    background: transparent;
    font-size: 22px;
    line-height: 1;
    color: var(--pm-muted, #8e8e93);
    cursor: pointer;
    width: 28px;
    height: 28px;
    border-radius: 8px;
  }
  .pm-x:hover {
    background: var(--pm-hover, rgba(0, 0, 0, 0.05));
  }
  .pm-modal-body {
    padding: 6px 22px 18px;
    overflow-y: auto;
  }
  .pm-modal-foot {
    padding: 12px 22px 18px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  @keyframes pm-fade {
    from {
      opacity: 0;
    }
  }
  @keyframes pm-pop {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.98);
    }
  }
</style>
