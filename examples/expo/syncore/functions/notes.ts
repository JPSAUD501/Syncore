import {
  createFunctionReference,
  mutation,
  query,
  s
} from "../_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) =>
    ctx.db.query("notes").withIndex("by_pinned_created").order("desc").collect()
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_pinned_created")
      .collect();
    const colors = new Map<string, number>();
    for (const note of notes) {
      colors.set(note.color, (colors.get(note.color) ?? 0) + 1);
    }

    return {
      total: notes.length,
      pinned: notes.filter((note) => note.pinned).length,
      colors: Array.from(colors.entries()).map(([color, count]) => ({
        color,
        count
      })),
      lastUpdatedAt:
        notes.length === 0
          ? null
          : Math.max(...notes.map((note) => note.updatedAt))
    };
  }
});

export const get = query({
  args: { id: s.string() },
  handler: async (ctx, args) => ctx.db.get("notes", args.id)
});

function decodeBase64(base64: string): Uint8Array {
  const binary =
    typeof atob === "function"
      ? atob(base64)
      : (
          globalThis as {
            Buffer?: { from(value: string, encoding: "base64"): Uint8Array };
          }
        ).Buffer?.from(base64, "base64");
  if (binary instanceof Uint8Array) {
    return binary;
  }
  if (typeof binary !== "string") {
    throw new Error("Base64 decoding is not available in this runtime.");
  }
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function encodeBase64(bytes: Uint8Array): string {
  if (typeof btoa === "function") {
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }
  const buffer = (
    globalThis as {
      Buffer?: { from(value: Uint8Array): { toString(encoding: "base64"): string } };
    }
  ).Buffer;
  if (!buffer) {
    throw new Error("Base64 encoding is not available in this runtime.");
  }
  return buffer.from(bytes).toString("base64");
}

export const search = query({
  args: { query: s.string() },
  handler: async (ctx, args) => {
    if (!args.query.trim()) return [];
    return ctx.db
      .query("notes")
      .withSearchIndex("search_body", (s) => s.search("body", args.query))
      .collect();
  }
});

export const byColor = query({
  args: { color: s.string() },
  handler: async (ctx, args) =>
    ctx.db
      .query("notes")
      .withIndex("by_color", (q) => q.eq("color", args.color))
      .order("desc")
      .collect()
});

export const create = mutation({
  args: { title: s.string(), body: s.string(), color: s.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    return ctx.db.insert("notes", {
      title: args.title,
      body: args.body,
      color: args.color,
      pinned: false,
      createdAt: now,
      updatedAt: now
    });
  }
});

export const update = mutation({
  args: { id: s.string(), title: s.string(), body: s.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch("notes", args.id, {
      title: args.title,
      body: args.body,
      updatedAt: Date.now()
    });
  }
});

export const setColor = mutation({
  args: { id: s.string(), color: s.string() },
  returns: s.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("notes", args.id, {
      color: args.color,
      updatedAt: Date.now()
    });
    return null;
  }
});

export const togglePin = mutation({
  args: { id: s.string() },
  returns: s.null(),
  handler: async (ctx, args) => {
    const note = await ctx.db.get("notes", args.id);
    if (!note) return null;
    await ctx.db.patch("notes", args.id, {
      pinned: !note.pinned,
      updatedAt: Date.now()
    });
    return null;
  }
});

export const seedDemo = mutation({
  args: {},
  returns: s.number(),
  handler: async (ctx) => {
    const existing = await ctx.db.query("notes").collect();
    if (existing.length > 0) {
      return 0;
    }

    const samples = [
      {
        title: "Offline launch checklist",
        body: "Open the app with airplane mode enabled, create a note, pin it, then reopen to verify local persistence.",
        color: "#6C63FF",
        pinned: true
      },
      {
        title: "Dashboard trace ideas",
        body: "Watch notes/list, notes/stats, search, and pin mutations in the Syncore dashboard while editing this app.",
        color: "#4ECDC4",
        pinned: false
      },
      {
        title: "Expo web adapter",
        body: "The app code should stay clean. Platform-specific storage and wasm setup belong inside the Syncore Expo adapter.",
        color: "#FFEAA7",
        pinned: false
      }
    ];
    const now = Date.now();
    let inserted = 0;

    for (const [index, sample] of samples.entries()) {
      await ctx.db.insert("notes", {
        title: sample.title,
        body: sample.body,
        color: sample.color,
        pinned: sample.pinned,
        createdAt: now - index * 60_000,
        updatedAt: now - index * 60_000
      });
      inserted += 1;
    }

    return inserted;
  }
});

export const remove = mutation({
  args: { id: s.string() },
  returns: s.null(),
  handler: async (ctx, args) => {
    const note = await ctx.db.get("notes", args.id);
    if (note?.photoStorageId) {
      await ctx.storage.delete(note.photoStorageId).catch(() => undefined);
    }
    await ctx.db.delete("notes", args.id);
    return null;
  }
});

export const attachPhoto = mutation({
  args: {
    id: s.string(),
    fileName: s.string(),
    contentType: s.string(),
    base64: s.string()
  },
  returns: s.null(),
  handler: async (ctx, args) => {
    const note = await ctx.db.get("notes", args.id);
    if (!note) return null;
    if (note.photoStorageId) {
      await ctx.storage.delete(note.photoStorageId).catch(() => undefined);
    }
    const bytes = decodeBase64(args.base64);
    const storageId = await ctx.storage.put({
      data: bytes,
      fileName: args.fileName,
      contentType: args.contentType || "image/jpeg"
    });
    await ctx.db.patch("notes", args.id, {
      photoStorageId: storageId,
      photoContentType: args.contentType || "image/jpeg",
      photoSize: bytes.byteLength,
      photoFileName: args.fileName,
      updatedAt: Date.now()
    });
    return null;
  }
});

export const removePhoto = mutation({
  args: { id: s.string() },
  returns: s.null(),
  handler: async (ctx, args) => {
    const note = await ctx.db.get("notes", args.id);
    if (!note?.photoStorageId) return null;
    await ctx.storage.delete(note.photoStorageId).catch(() => undefined);
    await ctx.db.patch("notes", args.id, {
      photoStorageId: undefined,
      photoContentType: undefined,
      photoSize: undefined,
      photoFileName: undefined,
      updatedAt: Date.now()
    });
    return null;
  }
});

export const getPhoto = query({
  args: { id: s.string() },
  handler: async (ctx, args) => {
    const note = await ctx.db.get("notes", args.id);
    if (!note?.photoStorageId || !note.photoContentType) return null;
    const bytes = await ctx.storage.read(note.photoStorageId);
    if (!bytes) return null;
    return `data:${note.photoContentType};base64,${encodeBase64(bytes)}`;
  }
});

export const scheduleAutoSave = mutation({
  args: { id: s.string(), title: s.string(), body: s.string() },
  handler: async (ctx, args) =>
    ctx.scheduler.runAfter(
      1500,
      createFunctionReference("mutation", "notes/update"),
      { id: args.id, title: args.title, body: args.body },
      { type: "skip" }
    )
});
