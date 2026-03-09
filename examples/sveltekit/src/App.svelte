<script lang="ts">
  import { onDestroy } from "svelte";
  import { createMutation, createQueryStore, setSyncoreClient } from "syncore/svelte";
  import { createBrowserWorkerClient } from "syncore/browser";
  import { api } from "../syncore/_generated/api";

  const managed = createBrowserWorkerClient({
    workerUrl: new URL("./syncore.worker.ts", import.meta.url)
  });

  setSyncoreClient(managed.client);

  const todos = createQueryStore(api.todos.list);
  const createTodo = createMutation(api.todos.create);

  let draft = "";

  async function addTodo() {
    const text = draft.trim();
    if (!text) {
      return;
    }
    await createTodo({ text });
    draft = "";
  }

  onDestroy(() => {
    managed.dispose();
  });

  $: state = $todos;
  $: items = state.data ?? [];
</script>

<svelte:head>
  <title>Syncore + Svelte</title>
</svelte:head>

<main>
  <p>Syncore + Svelte</p>
  <h1>Reactive local todos in a browser worker.</h1>

  <div class="composer">
    <input bind:value={draft} placeholder="Write a local todo" />
    <button on:click={() => void addTodo()}>Add todo</button>
  </div>

  {#if state.status === "loading"}
    <p class="status">Booting local runtime...</p>
  {:else if state.error}
    <p class="status">{state.error.message}</p>
  {:else}
    <ul>
      {#each items as todo}
        <li>{todo.text}</li>
      {/each}
    </ul>
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: Inter, system-ui, sans-serif;
    background: #0b1220;
    color: #f7f4ec;
  }

  main {
    max-width: 720px;
    margin: 0 auto;
    padding: 48px 20px;
  }

  p {
    color: #7ed4c8;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-size: 12px;
  }

  h1 {
    margin: 12px 0 24px;
    font-size: 40px;
    line-height: 1.1;
  }

  .composer {
    display: flex;
    gap: 12px;
    margin-bottom: 24px;
  }

  input {
    flex: 1;
    padding: 12px 14px;
    border-radius: 14px;
    border: 1px solid #243247;
    background: #101a2b;
    color: inherit;
  }

  button {
    padding: 12px 18px;
    border: 0;
    border-radius: 14px;
    background: #ffb454;
    color: #111722;
    font-weight: 700;
  }

  .status {
    color: #aab4c0;
  }

  ul {
    padding-left: 20px;
  }

  li {
    margin-bottom: 8px;
  }
</style>
