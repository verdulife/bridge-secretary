<script lang="ts">
  import { onMount } from "svelte";
  import { init, onThemeChange } from "./lib/telegram";
  import Nav from "./components/Nav.svelte";
  import Profile from "./sections/Profile.svelte";
  import Bridge from "./sections/Bridge.svelte";
  import Integrations from "./sections/Integrations.svelte";
  import Account from "./sections/Account.svelte";

  type Section = "profile" | "bridge" | "integrations" | "account";
  let active: Section = "integrations";

  onMount(() => {
    init();
    onThemeChange(() => {});
  });
</script>

<div class="min-h-screen" style="background: var(--bg); color: var(--text);">
  <main class="pb-20 px-4 pt-6 max-w-lg mx-auto">
    {#if active === "profile"}
      <Profile />
    {:else if active === "bridge"}
      <Bridge />
    {:else if active === "integrations"}
      <Integrations />
    {:else if active === "account"}
      <Account />
    {/if}
  </main>

  <Nav {active} on:navigate={e => active = e.detail} />
</div>