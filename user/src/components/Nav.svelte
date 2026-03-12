<script lang="ts">
  import { createEventDispatcher } from "svelte";

  export let active: string;
  const dispatch = createEventDispatcher();

  const items = [
    { id: "profile", label: "Perfil", icon: "👤" },
    { id: "bridge", label: "Bridge", icon: "🌉" },
    { id: "integrations", label: "Conexiones", icon: "🔗" },
    { id: "account", label: "Cuenta", icon: "⚙️" },
  ];
</script>

<nav
  class="fixed bottom-0 left-0 right-0 flex justify-around items-center px-2 py-3 border-t"
  style="background: var(--bg-secondary); border-color: var(--hint)20;"
>
  {#each items as item}
    <button
      on:click={() => dispatch("navigate", item.id)}
      class="flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-all"
      style={active === item.id
        ? "color: var(--button);"
        : "color: var(--hint);"}
    >
      <span class="text-xl">{item.icon}</span>
      <span class="text-xs font-medium">{item.label}</span>
    </button>
  {/each}
</nav>
