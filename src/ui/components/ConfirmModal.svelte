<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import Modal from "./Modal.svelte";

  export let title = "Confirm";
  export let message = "";
  export let confirmLabel = "Delete";
  export let cancelLabel = "Cancel";
  export let danger = true;

  const dispatch = createEventDispatcher();
</script>

<Modal {title} width={440} on:close={() => dispatch("cancel")}>
  <p class="msg">{message}</p>
  <svelte:fragment slot="footer">
    <button class="btn ghost" on:click={() => dispatch("cancel")}>{cancelLabel}</button>
    <button class="btn {danger ? 'danger' : 'primary'}" on:click={() => dispatch("confirm")}>{confirmLabel}</button>
  </svelte:fragment>
</Modal>

<style>
  .msg {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--pm-text, #1d1d1f);
    white-space: pre-wrap;
  }
  .btn {
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    padding: 7px 14px;
    border-radius: 9px;
    cursor: pointer;
    border: 1px solid transparent;
  }
  .btn.ghost {
    background: transparent;
    border-color: var(--pm-border, rgba(0, 0, 0, 0.12));
    color: var(--pm-text, #1d1d1f);
  }
  .btn.ghost:hover {
    background: var(--pm-hover, rgba(0, 0, 0, 0.05));
  }
  .btn.primary {
    background: var(--pm-accent, #007aff);
    color: #fff;
  }
  .btn.primary:hover {
    background: #006fe8;
  }
  .btn.danger {
    background: #ff3b30;
    color: #fff;
  }
  .btn.danger:hover {
    background: #e0342a;
  }
</style>
