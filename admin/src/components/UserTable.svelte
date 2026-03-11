<script lang="ts">
  export let users: {
    id: number;
    username: string | null;
    first_name: string | null;
    status: string;
    created_at: string;
  }[];
</script>

<div class="rounded-lg border border-zinc-800 overflow-hidden">
  <table class="w-full text-sm">
    <thead class="bg-zinc-900 text-zinc-400">
      <tr>
        <th class="px-4 py-3 text-left">Usuario</th>
        <th class="px-4 py-3 text-left">ID</th>
        <th class="px-4 py-3 text-left">Status</th>
        <th class="px-4 py-3 text-left">Registro</th>
        <th class="px-4 py-3 text-left">Acciones</th>
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
            <select
              class="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200"
              value={user.status}
              on:change={async (e) => {
                await fetch("/api/users/status", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    id: user.id,
                    status: e.currentTarget.value,
                  }),
                });
              }}
            >
              <option value="waitlist">waitlist</option>
              <option value="beta">beta</option>
              <option value="active">active</option>
              <option value="blocked">blocked</option>
            </select>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
