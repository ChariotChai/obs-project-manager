<script lang="ts">
  export let color: string | undefined;
  export let label: string;
  export let subtle = false;
</script>

<span class="badge" class:subtle style="--c:{color ?? '#8E8E93'}">{label}</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.5;
    color: var(--c);
    background: color-mix(in srgb, var(--c) 12%, transparent);
    white-space: nowrap;
    letter-spacing: 0.1px;
  }
  .badge::before {
    content: "";
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--c);
  }
  .subtle {
    color: var(--c);
    background: color-mix(in srgb, var(--c) 10%, transparent);
  }
</style>
