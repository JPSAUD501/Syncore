import { mutation, query, s } from "../_generated/server";

const COLORS = [
  "#5DE4C7",
  "#7C93F3",
  "#F2A65A",
  "#E06C75",
  "#C68FDD",
  "#57C785"
] as const;

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

export const list = query({
  args: {},
  handler: async (ctx) =>
    ctx.db.query("contacts").withIndex("by_created").order("desc").collect()
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_created")
      .collect();
    const companies = new Set(
      contacts
        .map((contact) => contact.company)
        .filter((company) => company.length > 0)
    );

    return {
      total: contacts.length,
      companies: companies.size,
      favorites: contacts.filter((contact) => contact.favorite === true).length,
      newestAt:
        contacts.length === 0
          ? null
          : Math.max(...contacts.map((contact) => contact.createdAt))
    };
  }
});

export const search = query({
  args: { query: s.string() },
  handler: async (ctx, args) => {
    const trimmed = args.query.trim();
    if (!trimmed) {
      return [];
    }
    return ctx.db
      .query("contacts")
      .withSearchIndex("search_name", (search) =>
        search.search("name", trimmed)
      )
      .collect();
  }
});

export const create = mutation({
  args: { name: s.string(), email: s.string(), company: s.string() },
  returns: s.string(),
  handler: async (ctx, args) =>
    ctx.db.insert("contacts", {
      name: args.name,
      email: args.email,
      company: args.company,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
      favorite: false,
      createdAt: Date.now()
    })
});

export const toggleFavorite = mutation({
  args: { id: s.string() },
  returns: s.null(),
  handler: async (ctx, args) => {
    const contact = await ctx.db.get("contacts", args.id);
    if (!contact) {
      return null;
    }
    await ctx.db.patch("contacts", args.id, {
      favorite: contact.favorite !== true
    });
    return null;
  }
});

export const seedDemo = mutation({
  args: {},
  returns: s.number(),
  handler: async (ctx) => {
    const existing = await ctx.db.query("contacts").collect();
    if (existing.length > 0) {
      return 0;
    }

    const samples = [
      ["Maya Chen", "maya@example.test", "Northstar Labs"],
      ["Rafael Costa", "rafael@example.test", "Orbit Studio"],
      ["Iris Novak", "iris@example.test", "FieldKit"],
      ["Sam Rivera", "sam@example.test", "Northstar Labs"]
    ] as const;
    const now = Date.now();

    for (const [index, sample] of samples.entries()) {
      await ctx.db.insert("contacts", {
        name: sample[0],
        email: sample[1],
        company: sample[2],
        color: COLORS[index % COLORS.length]!,
        favorite: index === 0,
        createdAt: now - index * 90_000
      });
    }

    return samples.length;
  }
});

export const remove = mutation({
  args: { id: s.string() },
  returns: s.null(),
  handler: async (ctx, args) => {
    const attachments = await ctx.db
      .query("contactAttachments")
      .withIndex("by_contact", (q) => q.eq("contactId", args.id))
      .collect();
    for (const attachment of attachments) {
      await ctx.storage.delete(attachment.storageId).catch(() => undefined);
      await ctx.db.delete("contactAttachments", attachment._id);
    }
    await ctx.db.delete("contacts", args.id);
    return null;
  }
});

export const listAttachments = query({
  args: { contactId: s.string() },
  handler: async (ctx, args) =>
    ctx.db
      .query("contactAttachments")
      .withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
      .order("desc")
      .collect()
});

export const attachFile = mutation({
  args: {
    contactId: s.string(),
    fileName: s.string(),
    contentType: s.string(),
    base64: s.string()
  },
  returns: s.string(),
  handler: async (ctx, args) => {
    const contact = await ctx.db.get("contacts", args.contactId);
    if (!contact) {
      throw new Error("Contact not found.");
    }
    const bytes = decodeBase64(args.base64);
    const storageId = await ctx.storage.put({
      data: bytes,
      fileName: args.fileName,
      contentType: args.contentType || "application/octet-stream"
    });
    return ctx.db.insert("contactAttachments", {
      contactId: args.contactId,
      fileName: args.fileName,
      contentType: args.contentType || "application/octet-stream",
      size: bytes.byteLength,
      storageId,
      createdAt: Date.now()
    });
  }
});

export const removeAttachment = mutation({
  args: { id: s.string() },
  returns: s.null(),
  handler: async (ctx, args) => {
    const attachment = await ctx.db.get("contactAttachments", args.id);
    if (!attachment) {
      return null;
    }
    await ctx.storage.delete(attachment.storageId).catch(() => undefined);
    await ctx.db.delete("contactAttachments", args.id);
    return null;
  }
});
