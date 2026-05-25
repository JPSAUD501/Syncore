import { mutation, query, s } from "../_generated/server";

const COLORS = [
  "#5DE4C7",
  "#7C93F3",
  "#F2A65A",
  "#E06C75",
  "#C68FDD",
  "#57C785"
] as const;

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
    await ctx.db.delete("contacts", args.id);
    return null;
  }
});
