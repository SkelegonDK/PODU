import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

export const complete = internalMutation({ args: {
  providerId: v.string(), agentId: v.string(), durationSeconds: v.number(),
  turns: v.array(v.object({ role: v.union(v.literal("user"), v.literal("agent")), message: v.string() })),
}, handler: async (ctx, args) => {
  // Match only IDs reserved from ElevenLabs by the authenticated server action.
  const c = await ctx.db.query("conversations").withIndex("by_providerId", q => q.eq("providerId", args.providerId)).unique();
  if (!c || c.agentId !== args.agentId || c.transcriptFinal) return;
  const old = await ctx.db.query("turns").withIndex("by_conversation", q => q.eq("conversationId", c._id)).take(4000);
  for (const t of old) await ctx.db.delete(t._id);
  for (const [i, t] of args.turns.entries()) await ctx.db.insert("turns", { ...t, conversationId: c._id, sequence: i + 1, eventId: `final:${i}` });
  await ctx.db.patch(c._id, { status: "ended", durationSeconds: args.durationSeconds, transcriptFinal: true, turnCount: args.turns.length,
    memory: [], memoryCursor: 0, memoryRevision: (c.memoryRevision ?? 0) + 1, memoryScheduled: true });
  await ctx.scheduler.runAfter(0, internal.memory.compact, { id: c._id });
  if (c.saveRecording) await ctx.scheduler.runAfter(5000, internal.archive.fetchAudio, { id: c._id, attempt: 0 });
} });

export const audioInput = internalQuery({ args: { id: v.id("conversations") }, handler: (ctx, { id }) => ctx.db.get(id) });
export const attachAudio = internalMutation({ args: { id: v.id("conversations"), storageId: v.id("_storage") }, handler: async (ctx, { id, storageId }) => {
  const c = await ctx.db.get(id);
  if (!c || !c.saveRecording || c.recordingId) { await ctx.storage.delete(storageId); return; }
  await ctx.db.patch(id, { recordingId: storageId, recordingStatus: "available" });
} });
export const audioFailed = internalMutation({ args: { id: v.id("conversations") }, handler: async (ctx, { id }) => {
  const c = await ctx.db.get(id);
  if (c && !c.recordingId) await ctx.db.patch(id, { recordingStatus: "unavailable" });
} });

export const fetchAudio = internalAction({ args: { id: v.id("conversations"), attempt: v.number() }, handler: async (ctx, { id, attempt }): Promise<void> => {
  const c = await ctx.runQuery(internal.archive.audioInput, { id });
  if (!c?.providerId || !c.saveRecording || c.recordingId) return;
  const key = process.env.ELEVENLABS_API_KEY;
  try {
    if (!key) throw new Error("Missing API key");
    const response = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(c.providerId)}/audio`, {
      headers: { "xi-api-key": key }, signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error("Audio not available yet");
    const blob = await response.blob();
    if (blob.size > 40_000_000 || !blob.size) throw new Error("Recording exceeds archive limit");
    const storageId = await ctx.storage.store(blob);
    await ctx.runMutation(internal.archive.attachAudio, { id, storageId });
  } catch {
    if (attempt < 3) await ctx.scheduler.runAfter(15_000 * (attempt + 1), internal.archive.fetchAudio, { id, attempt: attempt + 1 });
    else await ctx.runMutation(internal.archive.audioFailed, { id });
  }
} });
