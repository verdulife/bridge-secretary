<script lang="ts">
  import { onMount } from "svelte";
  import { tg, haptic } from "../lib/telegram";
  import { getIntegrations, getOAuthUrl } from "../lib/api";
  import Toast from "../components/Toast.svelte";

  let toast: Toast;
  let loading = true;
  let integrations = { gmail: false, calendar: false, notion: false };

  async function fetchIntegrations() {
    try {
      integrations = await getIntegrations();
    } catch {
      toast.show("Error al cargar las integraciones", "error");
    } finally {
      loading = false;
    }
  }

  async function connect(service: "gmail") {
    haptic("light");
    try {
      const { url } = await getOAuthUrl();
      // En desarrollo abre en la misma ventana
      if (import.meta.env.DEV) {
        window.location.href = url;
      } else {
        tg.openLink(url);
      }
    } catch {
      toast.show("Error al obtener la URL de conexión", "error");
    }
  }

  onMount(() => {
    fetchIntegrations();
    tg.onEvent("activated", fetchIntegrations);

    // Fallback para cuando Telegram no dispara activated
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") fetchIntegrations();
    });
  });

  const items = [
    {
      id: "gmail",
      name: "Gmail",
      description: "Lectura y clasificación de emails",
      icon: "✉️",
      available: true,
    },
    {
      id: "calendar",
      name: "Google Calendar",
      description: "Gestión de eventos y agenda",
      icon: "📅",
      available: false,
    },
    {
      id: "notion",
      name: "Notion",
      description: "Tareas, notas e informes",
      icon: "📝",
      available: false,
    },
  ];
</script>

<Toast bind:this={toast} />

<div class="space-y-6">
  <div>
    <h1 class="text-xl font-semibold" style="color: var(--text);">
      Conexiones
    </h1>
    <p class="text-sm mt-1" style="color: var(--hint);">
      Conecta tus servicios para que Bridge pueda ayudarte.
    </p>
  </div>

  {#if loading}
    <div class="space-y-3">
      {#each [1, 2, 3] as _}
        <div
          class="rounded-2xl p-4 animate-pulse"
          style="background: var(--bg-secondary); height: 80px;"
        ></div>
      {/each}
    </div>
  {:else}
    <div class="space-y-3">
      {#each items as item}
        <div
          class="rounded-2xl p-4 flex items-center gap-4"
          style="background: var(--bg-secondary);"
        >
          <span class="text-2xl">{item.icon}</span>
          <div class="flex-1 min-w-0">
            <div class="font-medium text-sm" style="color: var(--text);">
              {item.name}
            </div>
            <div class="text-xs mt-0.5 truncate" style="color: var(--hint);">
              {item.description}
            </div>
          </div>
          {#if !item.available}
            <span
              class="text-xs px-2 py-1 rounded-lg"
              style="background: var(--bg); color: var(--hint);"
            >
              Próximamente
            </span>
          {:else if integrations[item.id as keyof typeof integrations]}
            <span
              class="text-xs px-2 py-1 rounded-lg font-medium"
              style="background: var(--button)20; color: var(--button);"
            >
              Conectado
            </span>
          {:else}
            <button
              on:click={() => connect(item.id as "gmail")}
              class="text-xs px-3 py-1.5 rounded-lg font-medium transition-opacity active:opacity-70"
              style="background: var(--button); color: var(--button-text);"
            >
              Conectar
            </button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
