<script lang="ts">
  export let status: string;
  export let size = 8;
  import { STATUS_COLORS } from "../../constants";
  $: color = STATUS_COLORS[status] ?? "#8E8E93";
</script>

<span
  class="dot"
  style="--c:{color}; --size:{size}px"
  title={status}
  aria-label={status}
></span>

<style>
  .dot {
    display: inline-block;
    width: var(--size);
    height: var(--size);
    border-radius: 50%;
    background: var(--c);
    flex-shrink: 0;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--c) 18%, transparent);
  }
</style>
