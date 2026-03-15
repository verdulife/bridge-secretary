<script lang="ts">
  import { onMount } from "svelte";
  import { haptic } from "../lib/telegram";
  import { getProfile, updateProfile } from "../lib/api";
  import Toast from "../components/Toast.svelte";

  let toast: Toast;
  let loading = true;
  let saving = false;

  let name = "";
  let tone = "";
  let style = "";

  async function fetchProfile() {
    try {
      const data = await getProfile();
      name = data.soul.name ?? "";
      tone = data.soul.tone ?? "";
      style = data.soul.style ?? "";
    } catch {
      toast.show("Error al cargar los datos de Bridge", "error");
    } finally {
      loading = false;
    }
  }

  async function save() {
    haptic("light");
    saving = true;
    try {
      await updateProfile({
        soul: {
          name: name || "Bridge",
          tone: tone || null,
          style: style || null,
        },
      });
      haptic("success");
      toast.show("Cambios guardados", "success");
    } catch {
      haptic("error");
      toast.show("Error al guardar", "error");
    } finally {
      saving = false;
    }
  }

  onMount(fetchProfile);
</script>

<Toast bind:this={toast} />

<div class="space-y-6">
  <div>
    <h1 class="text-xl font-semibold" style="color: var(--text);">Bridge</h1>
    <p class="text-sm mt-1" style="color: var(--hint);">Cómo es tu asistente contigo.</p>
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
      <!-- Nombre del asistente -->
      <div class="rounded-2xl p-4" style="background: var(--bg-secondary);">
        <label class="text-xs font-medium" style="color: var(--hint);" for="botName">NOMBRE</label>
        <input
          type="text"
          id="botName"
          bind:value={name}
          placeholder="Bridge"
          class="w-full mt-1 bg-transparent text-sm outline-none"
          style="color: var(--text);"
        />
      </div>

      <!-- Campos de solo lectura -->
      {#each [{ label: "TONO", value: tone || "Sin definir" }, { label: "ESTILO", value: style || "Sin definir" }] as field}
        <div class="rounded-2xl p-4" style="background: var(--bg-secondary);">
          <div class="text-xs font-medium" style="color: var(--hint);">{field.label}</div>
          <div class="text-sm mt-1" style="color: var(--text);">{field.value}</div>
        </div>
      {/each}

      <!-- Nota informativa -->
      <p class="text-xs px-1" style="color: var(--hint);">
        Para ajustar el tono y estilo de Bridge, pídeselo en el chat. Por ejemplo: "quiero que seas
        más directo" o "háblame de tú".
      </p>
    </div>

    <button
      on:click={save}
      disabled={saving}
      class="w-full py-3 rounded-2xl font-medium text-sm transition-opacity active:opacity-70 disabled:opacity-50"
      style="background: var(--button); color: var(--button-text);"
    >
      {saving ? "Guardando..." : "Guardar cambios"}
    </button>
  {/if}
</div>
