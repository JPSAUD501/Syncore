import { createBrowserWorkerClient } from "syncorejs/browser";
import { api } from "./syncore/_generated/api";

interface Contact {
  _id: string;
  name: string;
  email: string;
  company: string;
  color: string;
  favorite?: boolean;
  createdAt: number;
}

/* ─── DOM refs ─── */
const $ = (sel: string) => document.querySelector(sel)!;
const listEl = $("#contact-list") as HTMLElement;
const countEl = $("#count") as HTMLElement;
const searchInput = $("#search-input") as HTMLInputElement;
const nameInput = $("#name-input") as HTMLInputElement;
const emailInput = $("#email-input") as HTMLInputElement;
const companyInput = $("#company-input") as HTMLInputElement;
const addBtn = $("#add-btn") as HTMLButtonElement;
const statsEl = $("#stats") as HTMLElement;
const seedBtn = $("#seed-btn") as HTMLButtonElement;

/* ─── Boot client ─── */
const managed = createBrowserWorkerClient({
  workerUrl: new URL("./syncore.worker.ts", import.meta.url)
});

const client = managed.client;

/* ─── Time formatting ─── */
function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/* ─── Render contacts ─── */
function render(contacts: Contact[]) {
  countEl.textContent = `${contacts.length} contact${contacts.length !== 1 ? "s" : ""}`;

  if (contacts.length === 0) {
    listEl.innerHTML = `<div class="empty">No contacts yet. Add one above.</div>`;
    return;
  }

  listEl.innerHTML = contacts
    .map(
      (c) => `
    <div class="contact-card">
      <div class="contact-avatar" style="background: ${c.color}">${c.name.charAt(0).toUpperCase()}</div>
      <div class="contact-info">
        <div class="contact-name">${esc(c.name)}</div>
        <div class="contact-meta">${esc(c.email)}${c.company ? ` · ${esc(c.company)}` : ""}</div>
        <div class="contact-time">${timeAgo(c.createdAt)}</div>
      </div>
      <button class="favorite-btn ${c.favorite ? "favorite-btn--active" : ""}" data-id="${c._id}" title="${c.favorite ? "Remove favorite" : "Mark favorite"}">
        ${c.favorite ? "★" : "☆"}
      </button>
      <button class="remove-btn" data-id="${c._id}" title="Remove">&times;</button>
    </div>
  `
    )
    .join("");

  /* Attach remove handlers */
  listEl.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = (btn as HTMLElement).dataset.id!;
      void client.mutation(api.contacts.remove, { id });
    });
  });

  listEl.querySelectorAll(".favorite-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = (btn as HTMLElement).dataset.id!;
      void client.mutation(api.contacts.toggleFavorite, { id });
    });
  });
}

function esc(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

/* ─── Watch query (reactive) ─── */
let currentWatch: { dispose?: () => void } | null = null;

function startWatch(searchQuery?: string) {
  currentWatch?.dispose?.();

  if (searchQuery?.trim()) {
    const watch = client.watchQuery(api.contacts.search, {
      query: searchQuery.trim()
    });
    watch.onUpdate(() => {
      const results = (watch.localQueryResult() ?? []) as Contact[];
      render(results);
    });
    currentWatch = watch;
  } else {
    const watch = client.watchQuery(api.contacts.list);
    watch.onUpdate(() => {
      const contacts = (watch.localQueryResult() ?? []) as Contact[];
      render(contacts);
    });
    currentWatch = watch;
  }
}

startWatch();

const statsWatch = client.watchQuery(api.contacts.stats);
statsWatch.onUpdate(() => {
  const stats = statsWatch.localQueryResult();
  if (!stats) return;
  statsEl.innerHTML = `
    <span><strong>${stats.companies}</strong> companies</span>
    <span><strong>${stats.favorites}</strong> favorites</span>
  `;
});

/* ─── Search ─── */
let searchTimer: ReturnType<typeof setTimeout> | null = null;

searchInput.addEventListener("input", () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    startWatch(searchInput.value);
  }, 200);
});

/* ─── Add contact ─── */
addBtn.addEventListener("click", () => {
  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  const company = companyInput.value.trim();

  if (!name || !email) {
    return;
  }

  void client.mutation(api.contacts.create, { name, email, company });
  nameInput.value = "";
  emailInput.value = "";
  companyInput.value = "";
  nameInput.focus();
});

seedBtn.addEventListener("click", async () => {
  await client.mutation(api.contacts.seedDemo);
});

/* Enter key to submit */
[nameInput, emailInput, companyInput].forEach((input) => {
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addBtn.click();
  });
});

/* ─── Cleanup ─── */
window.addEventListener("beforeunload", () => {
  currentWatch?.dispose?.();
  statsWatch.dispose();
  managed.dispose();
});
