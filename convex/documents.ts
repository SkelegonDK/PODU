import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { userId } from "./lib/ownership";

export const list = query({ args: {}, handler: async ctx => {
  const owner = await userId(ctx);
  const documents = await ctx.db.query("documents").withIndex("by_clerkId", q => q.eq("clerkId", owner)).order("desc").take(30);
  return documents.map(d => ({ id: d._id, name: d.name, uploadedAt: new Date(d.uploadedAt).toISOString() }));
} });
export const forPrompt = query({ args: {}, handler: async ctx => {
  const owner = await userId(ctx);
  const documents = await ctx.db.query("documents").withIndex("by_clerkId", q => q.eq("clerkId", owner)).order("desc").take(10);
  return documents.map(d => ({ id: d._id, name: d.name, content: d.content.slice(0, 2400), uploadedAt: new Date(d.uploadedAt).toISOString() }));
} });
export const save = mutation({ args: { name: v.string(), content: v.string() }, handler: async (ctx, args) => {
  const clerkId = await userId(ctx);
  if (!args.name.trim() || args.name.length > 255 || args.content.length > 200_000) throw new Error("Document too large or missing a name");
  const count = await ctx.db.query("documents").withIndex("by_clerkId", q => q.eq("clerkId", clerkId)).take(30);
  if (count.length >= 30) throw new Error("Document limit reached");
  const uploadedAt = Date.now();
  const id = await ctx.db.insert("documents", { ...args, clerkId, uploadedAt });
  return { id, name: args.name, uploadedAt: new Date(uploadedAt).toISOString() };
} });
export const get = query({ args: { id: v.id("documents") }, handler: async (ctx, { id }) => {
  const owner = await userId(ctx);
  const d = await ctx.db.get(id);
  if (!d || d.clerkId !== owner) return null;
  return { id: d._id, name: d.name, content: d.content, uploadedAt: new Date(d.uploadedAt).toISOString() };
} });
export const remove = mutation({ args: { id: v.id("documents") }, handler: async (ctx, { id }) => {
  const owner = await userId(ctx);
  const d = await ctx.db.get(id);
  if (!d || d.clerkId !== owner) return false;
  await ctx.db.delete(id);
  return true;
} });
