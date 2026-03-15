<script lang="ts">
  import { onMount } from "svelte";
  import { haptic, showConfirm } from "../lib/telegram";
  import { getUsage, deleteAccount } from "../lib/api";
  import Toast from "../components/Toast.svelte";

  let toast: Toast;
  let loading = true;
  let deleting = false;

  let totalInput = 0;
  let totalOutput = 0;
  let byTask: Record<string, { calls: number; input: number; output: number }> = {};

  const taskLabels: Record<string, string> = {
    chat: "Conversación",
    classify_email: "Clasificación de emails",
    summarize_emails: "Resumen de emails",
    infer_profile: "Inferencia de perfil",
    interpret_intent: "Interpretación de intención",
    normalize_tz: "Normalización de zona horaria",
    normalize_hl: "Normalización de horario",
    extract_search_query: "Búsqueda de emails",
    infer_lang: "Detección de idioma",
  };

  async function fetchUsage() {
    try {
      const data = await getUsage();
      totalInput = data.total_input;
      totalOutput = data.total_output;
      byTask = data.by_task;
    } catch {
      toast.show("Error al cargar el uso", "error");
    } finally {
      loading = false;
    }
  }

  async function handleDelete() {
    const confirmed = await showConfirm(
      "¿Estás seguro? Se eliminarán todos tus datos y no podrás recuperarlos."
    );
    if (!confirmed) return;

    haptic("warning");
    deleting = true;
    try {
      await deleteAccount();
      haptic("success");
      // Cerrar el panel tras eliminar
      window.Telegram?.WebApp?.close();
    } catch {
      haptic("error");
      toast.show("Error al eliminar la cuenta", "error");
      deleting = false;
    }
  }

  onMount(fetchUsage);
</script>

<Toast bind:this={toast} />

<div class="space-y-6">
  <div>
    <h1 class="text-xl font-semibold" style="color: var(--text);">Cuenta</h1>
    <p class="text-sm mt-1" style="color: var(--hint);">
      Uso de inteligencia artificial y gestión de tu cuenta.
    </p>
  </div>

  {#if loading}
    <div class="space-y-3">
      {#each [1, 2, 3] as _}
        <div
          class="rounded-2xl p-4 animate-pulse"
          style="background: var(--bg-secondary); height: 64px;"
        ></div>
      {/each}
    </div>
  {:else}
    <div class="space-y-3">
      <!-- Tokens totales -->
      <div class="rounded-2xl p-4" style="background: var(--bg-secondary);">
        <div class="text-xs font-medium mb-3" style="color: var(--hint);">TOKENS CONSUMIDOS</div>
        <div class="flex justify-between">
          <div>
            <div class="text-lg font-semibold" style="color: var(--text);">
              {totalInput.toLocaleString()}
            </div>
            <div class="text-xs mt-0.5" style="color: var(--hint);">Entrada</div>
          </div>
          <div class="text-right">
            <div class="text-lg font-semibold" style="color: var(--text);">
              {totalOutput.toLocaleString()}
            </div>
            <div class="text-xs mt-0.5" style="color: var(--hint);">Salida</div>
          </div>
          <div class="text-right">
            <div class="text-lg font-semibold" style="color: var(--button);">
              {(totalInput + totalOutput).toLocaleString()}
            </div>
            <div class="text-xs mt-0.5" style="color: var(--hint);">Total</div>
          </div>
        </div>
      </div>

      <!-- Uso por tarea -->
      {#if Object.keys(byTask).length > 0}
        <div class="rounded-2xl p-4" style="background: var(--bg-secondary);">
          <div class="text-xs font-medium mb-3" style="color: var(--hint);">TOKENS POR TAREA</div>
          <div class="space-y-3">
            {#each Object.entries(byTask) as [task, data]}
              <div>
                <div class="flex justify-between items-center mb-1">
                  <span class="text-sm" style="color: var(--text);">
                    {taskLabels[task] ?? task}
                  </span>
                  <span class="text-xs" style="color: var(--hint);">
                    {data.calls} llamadas
                  </span>
                </div>
                <div class="flex justify-between text-xs" style="color: var(--hint);">
                  <span>↑ {data.input.toLocaleString()} entrada</span>
                  <span>↓ {data.output.toLocaleString()} salida</span>
                  <span style="color: var(--button);"
                    >{(data.input + data.output).toLocaleString()} total</span
                  >
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <!-- Zona de peligro -->
    <div class="space-y-3 pt-2">
      <div class="text-xs font-medium px-1" style="color: var(--hint);">ZONA DE PELIGRO</div>
      <button
        on:click={handleDelete}
        disabled={deleting}
        class="w-full py-3 rounded-2xl font-medium text-sm transition-opacity active:opacity-70 disabled:opacity-50"
        style="background: #ef444420; color: #ef4444;"
      >
        {deleting ? "Eliminando..." : "Eliminar cuenta"}
      </button>
    </div>
  {/if}
</div>
