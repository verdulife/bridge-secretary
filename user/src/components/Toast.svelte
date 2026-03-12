<script lang="ts">
  export let message = "";
  export let type: "success" | "error" = "success";
  export let visible = false;

  export function show(msg: string, t: "success" | "error" = "success") {
    message = msg;
    type = t;
    visible = true;
    setTimeout(() => (visible = false), 3000);
  }
</script>

{#if visible}
  <div
    class="fixed top-4 left-4 right-4 max-w-lg mx-auto px-4 py-3 rounded-xl text-sm font-medium text-center transition-all z-50"
    style={type === "success"
      ? "background: var(--button); color: var(--button-text);"
      : "background: #ef4444; color: #ffffff;"}
  >
    {message}
  </div>
{/if}
