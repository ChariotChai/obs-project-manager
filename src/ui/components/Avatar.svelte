<script lang="ts">
  export let name: string | undefined;
  export let size = 24;

  $: initials = (name ?? "?")
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";

  // Deterministic soft color from the name.
  $: color = (function () {
    const palette = [
      ["#007AFF", "#E8F1FF"],
      ["#AF52DE", "#F3E8FF"],
      ["#FF2D55", "#FFE8EE"],
      ["#FF9F0A", "#FFF3E0"],
      ["#34C759", "#E6F8EC"],
      ["#5AC8FA", "#E4F6FF"],
      ["#BF5AF2", "#F4ECFF"],
      ["#FF3B30", "#FFE6E4"],
    ];
    let h = 0;
    for (let i = 0; i < (name ?? "").length; i++) h = (h * 31 + name!.charCodeAt(i)) >>> 0;
    return palette[h % palette.length];
  })();
</script>

<span
  class="avatar"
  style="--size:{size}px; --fg:{color[0]}; --bg:{color[1]}"
  title={name}
  tabindex="0"
  aria-label={name}
>
  {initials}
</span>

<style>
  .avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--size);
    height: var(--size);
    border-radius: 50%;
    background: var(--bg);
    color: var(--fg);
    font-size: calc(var(--size) * 0.4);
    font-weight: 600;
    line-height: 1;
    flex-shrink: 0;
    letter-spacing: 0.2px;
    user-select: none;
  }
</style>
