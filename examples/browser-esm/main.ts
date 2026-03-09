import { createBrowserWorkerClient } from "syncorejs/browser";
import { createFunctionReference } from "syncorejs";

/* ─── Function references (no codegen — all inline) ─── */
interface Contact {
  _id: string;
  name: string;
  email: string;
  company: string;
  color: string;
  createdAt: number;
}

const listContacts = createFunctionReference<
  "query",
  Record<never, never>,
  Contact[]
>("query", "contacts/list");

const searchContacts = createFunctionReference<
  "query",
  { query: string },
  Contact[]
>("query", "contacts/search");

const createContact = createFunctionReference<
  "mutation",
  { name: string; email: string; company: string },
  string
>("mutation", "contacts/create");

const removeContact = createFunctionReference<"mutation", { id: string }, null>(
  "mutation",
  "contacts/remove"
);

/* ─── DOM refs ─── */
const $ = (sel: string) => document.querySelector(sel)!;
const listEl = $("#contact-list") as HTMLElement;
const countEl = $("#count") as HTMLElement;
const searchInput = $("#search-input") as HTMLInputElement;
const nameInput = $("#name-input") as HTMLInputElement;
const emailInput = $("#email-input") as HTMLInputElement;
const companyInput = $("#company-input") as HTMLInputElement;
const addBtn = $("#add-btn") as HTMLButtonElement;
const logEl = $("#log") as HTMLElement;

/* ─── Boot client ─── */
const managed = createBrowserWorkerClient({
  workerUrl: new URL("./syncore.worker.ts", import.meta.url)
});

const client = managed.client;

let logLines: string[] = [];

function log(msg: string) {
  const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
  logLines.push(`[${ts}] ${msg}`);
  if (logLines.length > 50) logLines = logLines.slice(-50);
  logEl.textContent = logLines.join("\n");
  logEl.scrollTop = logEl.scrollHeight;
}

log("Booting Syncore runtime in web worker...");

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
      <button class="remove-btn" data-id="${c._id}" title="Remove">&times;</button>
    </div>
  `
    )
    .join("");

  /* Attach remove handlers */
  listEl.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = (btn as HTMLElement).dataset.id!;
      void client.mutation(removeContact, { id });
      log(`Removed contact ${id.slice(0, 8)}...`);
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
    const watch = client.watchQuery(searchContacts, {
      query: searchQuery.trim()
    });
    watch.onUpdate(() => {
      const results = (watch.localQueryResult() ?? []) as Contact[];
      render(results);
      log(`Search "${searchQuery}" → ${results.length} result(s)`);
    });
    currentWatch = watch;
  } else {
    const watch = client.watchQuery(listContacts);
    watch.onUpdate(() => {
      const contacts = (watch.localQueryResult() ?? []) as Contact[];
      render(contacts);
    });
    currentWatch = watch;
    log("Watching contacts list (reactive)");
  }
}

startWatch();

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
    log("Error: Name and email are required");
    return;
  }

  void client.mutation(createContact, { name, email, company });
  log(`Created contact: ${name}`);
  nameInput.value = "";
  emailInput.value = "";
  companyInput.value = "";
  nameInput.focus();
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
  managed.dispose();
});
