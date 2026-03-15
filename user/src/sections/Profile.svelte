<script lang="ts">
  import { onMount } from "svelte";
  import { haptic } from "../lib/telegram";
  import { getProfile, updateProfile } from "../lib/api";
  import Toast from "../components/Toast.svelte";

  let toast: Toast;
  let loading = true;
  let saving = false;

  let name = "";
  let tz = "";
  let hl = "";
  let lang = "";
  let response_speed = "";
  let notification_sensitivity = "";

  async function fetchProfile() {
    try {
      const data = await getProfile();
      name = data.profile.n ?? "";
      tz = data.profile.tz ?? "";
      hl = data.profile.hl ?? "";
      lang = data.profile.lang ?? "";
      response_speed = data.profile.response_speed ?? "";
      notification_sensitivity = data.profile.notification_sensitivity ?? "";
    } catch {
      toast.show("Error al cargar el perfil", "error");
    } finally {
      loading = false;
    }
  }

  async function save() {
    haptic("light");
    saving = true;
    try {
      await updateProfile({
        profile: {
          n: name || null,
          tz: tz || null,
          hl: hl || null,
          lang: lang || null,
          response_speed: response_speed || null,
          notification_sensitivity: notification_sensitivity || null,
        },
      });
      haptic("success");
      toast.show("Perfil guardado", "success");
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
    <h1 class="text-xl font-semibold" style="color: var(--text);">Perfil</h1>
    <p class="text-sm mt-1" style="color: var(--hint);">Cómo Bridge te conoce a ti.</p>
  </div>

  {#if loading}
    <div class="space-y-3">
      {#each [1, 2, 3, 4] as _}
        <div
          class="rounded-2xl p-4 animate-pulse"
          style="background: var(--bg-secondary); height: 64px;"
        ></div>
      {/each}
    </div>
  {:else}
    <div class="space-y-3">
      <!-- Nombre -->
      <div class="rounded-2xl p-4" style="background: var(--bg-secondary);">
        <label class="text-xs font-medium" style="color: var(--hint);" for="userName">NOMBRE</label>
        <input
          type="text"
          id="userName"
          bind:value={name}
          placeholder="Tu nombre"
          class="w-full mt-1 bg-transparent text-sm outline-none"
          style="color: var(--text);"
        />
      </div>

      <!-- Campos de solo lectura -->
      {#each [{ label: "ZONA HORARIA", value: tz || "Sin definir" }, { label: "HORARIO LABORAL", value: hl || "Sin definir" }, { label: "IDIOMA", value: lang || "Sin definir" }, { label: "VELOCIDAD DE RESPUESTA", value: response_speed || "Sin definir" }, { label: "SENSIBILIDAD DE NOTIFICACIONES", value: notification_sensitivity || "Sin definir" }] as field}
        <div class="rounded-2xl p-4" style="background: var(--bg-secondary);">
          <div class="text-xs font-medium" style="color: var(--hint);">{field.label}</div>
          <div class="text-sm mt-1" style="color: var(--text);">{field.value}</div>
        </div>
      {/each}

      <!-- Nota informativa -->
      <p class="text-xs px-1" style="color: var(--hint);">
        Para modificar estos datos, pídeselo directamente a Bridge en el chat. Él se encargará de
        actualizarlos correctamente.
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
