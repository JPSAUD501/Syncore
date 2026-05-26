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

interface ContactAttachment {
  _id: string;
  contactId: string;
  fileName: string;
  contentType: string;
  size: number;
  storageId: string;
  createdAt: number;
}

const $ = (sel: string) => document.querySelector(sel)!;
const listEl = $("#contact-list") as HTMLElement;
const attachmentPanelEl = $("#attachment-panel") as HTMLElement;
const countEl = $("#count") as HTMLElement;
const searchInput = $("#search-input") as HTMLInputElement;
const nameInput = $("#name-input") as HTMLInputElement;
const emailInput = $("#email-input") as HTMLInputElement;
const companyInput = $("#company-input") as HTMLInputElement;
const addBtn = $("#add-btn") as HTMLButtonElement;
const statsEl = $("#stats") as HTMLElement;
const seedBtn = $("#seed-btn") as HTMLButtonElement;
const attachmentInput = $("#attachment-input") as HTMLInputElement;
const attachmentLabel = $("#attachment-label") as HTMLElement;

const managed = createBrowserWorkerClient({
  workerUrl: new URL("./syncore.worker.ts", import.meta.url)
});
const client = managed.client;

let selectedContactId: string | null = null;
let storageAvailable = false;
let storageUnavailableReason = "Storage is not ready.";
let currentWatch: { dispose?: () => void } | null = null;
let attachmentWatch: { dispose?: () => void } | null = null;

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function esc(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(reader.error ?? new Error("Could not read file."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.slice(result.indexOf(",") + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

function render(contacts: Contact[]) {
  countEl.textContent = `${contacts.length} contact${contacts.length !== 1 ? "s" : ""}`;

  if (contacts.length === 0) {
    selectedContactId = null;
    listEl.innerHTML = `<div class="empty">No contacts yet. Add one above.</div>`;
    renderAttachments([]);
    return;
  }

  if (!selectedContactId || !contacts.some((c) => c._id === selectedContactId)) {
    selectedContactId = contacts[0]!._id;
    startAttachmentWatch();
  }

  listEl.innerHTML = contacts
    .map(
      (c) => `
    <div class="contact-card ${selectedContactId === c._id ? "contact-card--active" : ""}" data-id="${c._id}">
      <div class="contact-avatar" style="background: ${c.color}">${c.name.charAt(0).toUpperCase()}</div>
      <div class="contact-info">
        <div class="contact-name">${esc(c.name)}</div>
        <div class="contact-meta">${esc(c.email)}${c.company ? ` - ${esc(c.company)}` : ""}</div>
        <div class="contact-time">${timeAgo(c.createdAt)}</div>
      </div>
      <button class="favorite-btn ${c.favorite ? "favorite-btn--active" : ""}" data-id="${c._id}" title="${c.favorite ? "Remove favorite" : "Mark favorite"}">
        ${c.favorite ? "*" : "+"}
      </button>
      <button class="remove-btn" data-id="${c._id}" title="Remove">&times;</button>
    </div>
  `
    )
    .join("");

  listEl.querySelectorAll(".contact-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest("button")) return;
      selectedContactId = (card as HTMLElement).dataset.id!;
      render(contacts);
      startAttachmentWatch();
    });
  });

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

function renderAttachments(attachments: ContactAttachment[]) {
  attachmentInput.disabled = !storageAvailable || !selectedContactId;
  attachmentLabel.textContent = storageAvailable
    ? selectedContactId
      ? "Attach file"
      : "Select a contact"
    : storageUnavailableReason;

  if (!selectedContactId) {
    attachmentPanelEl.innerHTML = `<div class="empty attachment-empty">Select a contact to manage files.</div>`;
    return;
  }
  if (!storageAvailable) {
    attachmentPanelEl.innerHTML = `<div class="empty attachment-empty">${esc(storageUnavailableReason)}</div>`;
    return;
  }
  if (attachments.length === 0) {
    attachmentPanelEl.innerHTML = `<div class="empty attachment-empty">No files attached to this contact.</div>`;
    return;
  }
  attachmentPanelEl.innerHTML = attachments
    .map(
      (attachment) => `
        <div class="attachment-row">
          <div>
            <div class="attachment-name">${esc(attachment.fileName)}</div>
            <div class="attachment-meta">${esc(attachment.contentType)} - ${formatBytes(attachment.size)}</div>
          </div>
          <button class="attachment-remove" data-id="${attachment._id}" type="button">Remove</button>
        </div>`
    )
    .join("");
  attachmentPanelEl.querySelectorAll(".attachment-remove").forEach((button) => {
    button.addEventListener("click", () => {
      const id = (button as HTMLElement).dataset.id!;
      void client.mutation(api.contacts.removeAttachment, { id });
    });
  });
}

function startAttachmentWatch() {
  attachmentWatch?.dispose?.();
  if (!selectedContactId) {
    renderAttachments([]);
    return;
  }
  const watch = client.watchQuery(api.contacts.listAttachments, {
    contactId: selectedContactId
  });
  watch.onUpdate(() => {
    renderAttachments((watch.localQueryResult() ?? []) as ContactAttachment[]);
  });
  attachmentWatch = watch;
}

function startWatch(searchQuery?: string) {
  currentWatch?.dispose?.();

  if (searchQuery?.trim()) {
    const watch = client.watchQuery(api.contacts.search, {
      query: searchQuery.trim()
    });
    watch.onUpdate(() => {
      render((watch.localQueryResult() ?? []) as Contact[]);
    });
    currentWatch = watch;
  } else {
    const watch = client.watchQuery(api.contacts.list);
    watch.onUpdate(() => {
      render((watch.localQueryResult() ?? []) as Contact[]);
    });
    currentWatch = watch;
  }
}

startWatch();
startAttachmentWatch();

const statusWatch = client.watchRuntimeStatus();
statusWatch.onUpdate(() => {
  const status = statusWatch.localQueryResult();
  storageAvailable = status?.capabilities?.storage.available === true;
  storageUnavailableReason =
    status?.capabilities?.storage.reason ?? "Storage is unavailable.";
  startAttachmentWatch();
});

const statsWatch = client.watchQuery(api.contacts.stats);
statsWatch.onUpdate(() => {
  const stats = statsWatch.localQueryResult();
  if (!stats) return;
  statsEl.innerHTML = `
    <span><strong>${stats.companies}</strong> companies</span>
    <span><strong>${stats.favorites}</strong> favorites</span>
  `;
});

let searchTimer: ReturnType<typeof setTimeout> | null = null;
searchInput.addEventListener("input", () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    startWatch(searchInput.value);
  }, 200);
});

addBtn.addEventListener("click", () => {
  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  const company = companyInput.value.trim();

  if (!name || !email) return;

  void client.mutation(api.contacts.create, { name, email, company });
  nameInput.value = "";
  emailInput.value = "";
  companyInput.value = "";
  nameInput.focus();
});

seedBtn.addEventListener("click", async () => {
  await client.mutation(api.contacts.seedDemo);
});

attachmentInput.addEventListener("change", async () => {
  const file = attachmentInput.files?.[0];
  if (!file || !selectedContactId || !storageAvailable) {
    attachmentInput.value = "";
    return;
  }
  const base64 = await toBase64(file);
  await client.mutation(api.contacts.attachFile, {
    contactId: selectedContactId,
    fileName: file.name,
    contentType: file.type || "application/octet-stream",
    base64
  });
  attachmentInput.value = "";
});

[nameInput, emailInput, companyInput].forEach((input) => {
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addBtn.click();
  });
});

window.addEventListener("beforeunload", () => {
  currentWatch?.dispose?.();
  attachmentWatch?.dispose?.();
  statsWatch.dispose();
  statusWatch.dispose?.();
  managed.dispose();
});
