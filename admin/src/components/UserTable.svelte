<script lang="ts">
  export let users: {
    id: number;
    username: string | null;
    first_name: string | null;
    status: string;
    created_at: string;
  }[];

  async function updateStatus(id: number, action: "activate" | "block") {
    const res = await fetch("/api/users/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });

    const data = await res.json();

    if (data.ok) {
      users = users.map((u) =>
        u.id === id ? { ...u, status: data.status } : u,
      );
    }
  }
</script>

<div class="rounded-lg border border-zinc-800 overflow-hidden">
  <table class="w-full text-sm">
    <thead class="bg-zinc-900 text-zinc-400">
      <tr>
        <th class="px-4 py-3 text-left">Usuario</th>
        <th class="px-4 py-3 text-left">ID</th>
        <th class="px-4 py-3 text-left">Status</th>
        <th class="px-4 py-3 text-left">Registro</th>
        <th class="px-4 py-3 text-left">Acción</th>
      </tr>
    </thead>
    <tbody>
      {#each users as user}
        <tr
          class="border-t border-zinc-800 hover:bg-zinc-900 transition-colors"
        >
          <td class="px-4 py-3">
            <div class="font-medium">{user.first_name ?? "—"}</div>
            <div class="text-zinc-500 text-xs">
              @{user.username ?? "sin username"}
            </div>
          </td>
          <td class="px-4 py-3 text-zinc-400 font-mono text-xs">{user.id}</td>
          <td class="px-4 py-3">
            <span
              class="px-2 py-1 rounded-full text-xs font-medium
              {user.status === 'active' ? 'bg-green-900 text-green-300' : ''}
              {user.status === 'beta' ? 'bg-blue-900 text-blue-300' : ''}
              {user.status === 'waitlist'
                ? 'bg-yellow-900 text-yellow-300'
                : ''}
              {user.status === 'blocked' ? 'bg-red-900 text-red-300' : ''}
            "
            >
              {user.status}
            </span>
          </td>
          <td class="px-4 py-3 text-zinc-400 text-xs">
            {new Date(user.created_at).toLocaleDateString("es-ES")}
          </td>
          <td class="px-4 py-3">
            {#if user.status === "waitlist" || user.status === "blocked"}
              <button
                on:click={() => updateStatus(user.id, "activate")}
                class="px-3 py-1 bg-green-900 text-green-300 rounded text-xs font-medium hover:bg-green-800 transition-colors"
              >
                Activar
              </button>
            {:else if user.status === "beta" || user.status === "active"}
              <button
                on:click={() => updateStatus(user.id, "block")}
                class="px-3 py-1 bg-red-900 text-red-300 rounded text-xs font-medium hover:bg-red-800 transition-colors"
              >
                Bloquear
              </button>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
