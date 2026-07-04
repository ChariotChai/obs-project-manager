<script lang="ts">
  export let label: string;
  export let value = 0 | 100;
</script>

<div class="row">
  <div class="track">
    <div class="fill" style="width:{Math.max(0, Math.min(100, value))}%"></div>
  </div>
  {#if label}
    <span class="lbl">{label}</span>
  {/if}
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .track {
    flex: 1;
    height: 6px;
    background: var(--pm-track, rgba(0, 0, 0, 0.07));
    border-radius: 999px;
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: linear-gradient(90deg, #34c759, #30b850);
    border-radius: 999px;
    transition: width 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .lbl {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: var(--pm-muted, #8e8e93);
    min-width: 34px;
    text-align: right;
  }
</style>
