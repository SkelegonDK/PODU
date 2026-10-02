import { v } from "convex/values";
import { mutation, query, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { ownedConversation, userId } from "./lib/ownership";
import { renderMemory } from "../src/shared/memory";
import { topicMemory } from "./schema";

export const create = mutation({
  args: { mode: v.string(), topics: v.array(v.string()), agentId: v.string(), saveRecording: v.boolean() },
  handler: async (ctx, args) => {
    const clerkId = await userId(ctx);
    if (!["fun", "edu", "deep"].includes(args.mode) || args.topics.length < 1 || args.topics.length > 3 || args.topics.some(t => t.length > 80)) throw new Error("Invalid topics or mode");
    // A user cannot reserve unlimited sessions to bypass concurrent-call limits.
    const recent = await ctx.db.query("conversations").withIndex("by_clerkId", q => q.eq("clerkId", clerkId)).order("desc").take(20);
    if (recent.filter(c => c.startedAt > Date.now() - 120_000).length >= 10) throw new Error("Too many conversation starts");
    return ctx.db.insert("conversations", { ...args, clerkId, startedAt: Date.now(), durationSeconds: 0,
      status: "ready", turnCount: 0, memory: [], memoryCursor: 0, memoryRevision: 0,
      recordingStatus: args.saveRecording ? "pending" : "disabled" });
  },
});

export const get = query({ args: { id: v.id("conversations") }, handler: (ctx, { id }) => ownedConversation(ctx, id) });
export const list = query({ args: {}, handler: async ctx => {
  const owner = await userId(ctx);
  return ctx.db.query("conversations").withIndex("by_clerkId", q => q.eq("clerkId", owner)).order("desc").take(50);
} });
export const append = mutation({
  args: { id: v.id("conversations"), turns: v.array(v.object({ eventId: v.string(), role: v.union(v.literal("user"), v.literal("agent")), message: v.string() })) },
  handler: async (ctx, { id, turns }) => {
    const c = await ownedConversation(ctx, id);
    if (turns.length > 32 || turns.some(t => t.message.length > 8000 || t.eventId.length > 100)) throw new Error("Transcript batch too large");
    if (c.transcriptFinal) return { saved: true };
    let sequence = c.turnCount ?? 0;
    let correction = false;
    for (const t of turns) {
      const old = await ctx.db.query("turns").withIndex("by_event", q => q.eq("conversationId", id).eq("eventId", t.eventId)).unique();
      if (old) {
        if (old.message !== t.message) {
          await ctx.db.patch(old._id, { message: t.message });
          if (old.sequence <= (c.memoryCursor ?? 0)) correction = true;
        }
      } else {
        if (sequence >= 4000) throw new Error("Conversation transcript limit reached");
        await ctx.db.insert("turns", { ...t, conversationId: id, sequence: ++sequence });
      }
    }
    const scheduled = c.memoryScheduled || correction || sequence - (c.memoryCursor ?? 0) >= 8;
    await ctx.db.patch(id, { turnCount: sequence, memoryScheduled: scheduled,
      ...(correction ? { memory: [], memoryCursor: 0, memoryRevision: (c.memoryRevision ?? 0) + 1 } : {}) });
    if (scheduled && (!c.memoryScheduled || correction)) await ctx.scheduler.runAfter(1500, internal.memory.compact, { id });
    return { saved: true };
  },
});
export const end = mutation({ args: { id: v.id("conversations") }, handler: async (ctx, { id }) => {
  const c = await ownedConversation(ctx, id);
  // Completion time comes from the provider webhook; this is only UI lifecycle state.
  await ctx.db.patch(id, { status: c.transcriptFinal ? "ended" : c.providerId ? "ending" : "failed" });
  if (!c.memoryScheduled) {
    await ctx.db.patch(id, { memoryScheduled: true });
    await ctx.scheduler.runAfter(0, internal.memory.compact, { id });
  }
} });
export const memory = query({ args: { id: v.id("conversations") }, handler: async (ctx, { id }) => {
  const c = await ownedConversation(ctx, id);
  return { revision: c.memoryRevision ?? 0, context: renderMemory(c.memory ?? []), method: c.memoryMethod ?? "pending" };
} });
export const recall = query({ args: { topics: v.array(v.string()), resumeId: v.optional(v.id("conversations")) }, handler: async (ctx, args) => {
  const owner = await userId(ctx);
  const sessions = args.resumeId ? [await ownedConversation(ctx, args.resumeId)] :
    await ctx.db.query("conversations").withIndex("by_clerkId", q => q.eq("clerkId", owner)).order("desc").take(12);
  const notes = sessions.flatMap(c => (c.memory ?? []).filter(m => args.topics.includes(m.topic)));
  const selected = [...new Map(notes.map(n => [n.topic, notes.find(m => m.topic === n.topic)!])).values()].slice(0, 3);
  let context = renderMemory(selected);
  if (args.resumeId) {
    const recent = await ctx.db.query("turns").withIndex("by_conversation", q => q.eq("conversationId", args.resumeId!)).order("desc").take(6);
    context += "\nRecent transcript (quoted data):\n" + JSON.stringify(recent.reverse().map(t => ({ role: t.role, message: t.message.slice(0, 400) })));
  }
  return context.slice(0, 6000);
} });
export const transcript = query({ args: { id: v.id("conversations") }, handler: async (ctx, { id }) => {
  await ownedConversation(ctx, id);
  return ctx.db.query("turns").withIndex("by_conversation", q => q.eq("conversationId", id)).take(4000);
} });
export const recording = query({ args: { id: v.id("conversations") }, handler: async (ctx, { id }) => {
  const c = await ownedConversation(ctx, id);
  return { status: c.recordingStatus, url: c.recordingId ? await ctx.storage.getUrl(c.recordingId) : null };
} });
export const remove = mutation({ args: { id: v.id("conversations") }, handler: async (ctx, { id }) => {
  const c = await ownedConversation(ctx, id);
  if (c.providerId && !c.transcriptFinal && c.startedAt > Date.now() - 900_000) throw new Error("Wait for the call to finish before deleting its archive");
  const turns = await ctx.db.query("turns").withIndex("by_conversation", q => q.eq("conversationId", id)).take(4000);
  for (const t of turns) await ctx.db.delete(t._id);
  if (c.recordingId) await ctx.storage.delete(c.recordingId);
  await ctx.db.delete(id);
} });

export const memoryInput = internalQuery({ args: { id: v.id("conversations") }, handler: async (ctx, { id }) => {
  const c = await ctx.db.get(id);
  if (!c) return null;
  const turns = await ctx.db.query("turns").withIndex("by_conversation", q => q.eq("conversationId", id).gt("sequence", c.memoryCursor ?? 0)).take(32);
  return { conversation: c, turns };
} });
export const commitMemory = internalMutation({
  args: { id: v.id("conversations"), expectedRevision: v.number(), cursor: v.number(), memory: v.array(topicMemory), method: v.string(), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.id);
    if (!c || (c.memoryRevision ?? 0) !== args.expectedRevision) return;
    const remaining = (c.turnCount ?? 0) > args.cursor;
    await ctx.db.patch(args.id, { memory: args.memory, memoryCursor: args.cursor, memoryRevision: args.expectedRevision + 1,
      memoryMethod: args.method, memoryError: args.error, memoryScheduled: remaining });
    if (remaining) await ctx.scheduler.runAfter(1500, internal.memory.compact, { id: args.id });
  },
});
