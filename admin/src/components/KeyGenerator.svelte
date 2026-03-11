<script lang="ts">
  export let adminId: number;

  let generatedKey: string | null = null;
  let loading = false;

  async function generateKey() {
    loading = true;
    const res = await fetch("/api/keys/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ created_by: adminId }),
    });
    const data = await res.json();
    generatedKey = data.key;
    loading = false;
  }
</script>

<div class="flex flex-col gap-3">
  <button
    on:click={generateKey}
    disabled={loading}
    class="px-4 py-2 bg-zinc-100 text-zinc-950 rounded font-semibold hover:bg-zinc-300 disabled:opacity-50 transition-colors w-fit"
  >
    {loading ? "Generando..." : "Generar invite key"}
  </button>

  {#if generatedKey}
    <div class="flex items-center gap-3 bg-zinc-900 border border-zinc-700 rounded px-4 py-3">
      <code class="font-mono text-green-400 text-sm">{generatedKey}</code>
      <button
        on:click={() => navigator.clipboard.writeText(generatedKey!)}
        class="text-zinc-400 hover:text-zinc-200 text-xs"
      >
        Copiar
      </button>
    </div>
  {/if}
</div>