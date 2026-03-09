import { mutation, query, v } from "../_generated/server";

const TAGS = [
  "read-later",
  "reference",
  "inspiration",
  "tools",
  "learning",
  "news"
];

export const list = query({
  args: {},
  handler: async (ctx) =>
    ctx.db.query("bookmarks").withIndex("by_starred").order("desc").collect()
});

export const listByTag = query({
  args: { tag: v.string() },
  handler: async (ctx, args) =>
    ctx.db
      .query("bookmarks")
      .withIndex("by_tag", (q) => q.eq("tag", args.tag))
      .order("desc")
      .collect()
});

export const search = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    if (!args.query.trim()) return [];
    return ctx.db
      .query("bookmarks")
      .withSearchIndex("search_bookmarks", (s) => s.search("title", args.query))
      .collect();
  }
});

export const create = mutation({
  args: {
    url: v.string(),
    title: v.string(),
    description: v.string(),
    tag: v.string()
  },
  handler: async (ctx, args) =>
    ctx.db.insert("bookmarks", {
      url: args.url,
      title: args.title,
      description: args.description,
      tag: args.tag,
      starred: false,
      createdAt: Date.now()
    })
});

export const update = mutation({
  args: {
    id: v.string(),
    title: v.string(),
    description: v.string(),
    tag: v.string()
  },
  handler: async (ctx, args) => {
    await ctx.db.patch("bookmarks", args.id, {
      title: args.title,
      description: args.description,
      tag: args.tag
    });
  }
});

export const toggleStar = mutation({
  args: { id: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const bookmark = await ctx.db.get("bookmarks", args.id);
    if (!bookmark) return null;
    await ctx.db.patch("bookmarks", args.id, { starred: !bookmark.starred });
    return null;
  }
});

export const remove = mutation({
  args: { id: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.delete("bookmarks", args.id);
    return null;
  }
});

export { TAGS };
