import { action, internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { userId } from "./lib/ownership";

export const config = query({ args: {}, handler: async ctx => {
  await userId(ctx);
  const agentIds = { fun: !!process.env.ELEVENLABS_AGENT_ID_FUN, edu: !!process.env.ELEVENLABS_AGENT_ID_EDU, deep: !!process.env.ELEVENLABS_AGENT_ID_DEEP };
  return { hasApiKey: !!process.env.ELEVENLABS_API_KEY, apiKeySource: process.env.ELEVENLABS_API_KEY ? "env" as const : "none" as const,
    apiKeyPreview: null, agentIds, missingAgentModes: (Object.keys(agentIds) as (keyof typeof agentIds)[]).filter(m => !agentIds[m]) };
} });

export const issueToken = action({ args: { id: v.id("conversations") }, handler: async (ctx, { id }): Promise<{ token: string; conversation_id: string }> => {
  await userId(ctx);
  const c = await ctx.runQuery(api.conversations.get, { id });
  if (c.status !== "ready" || c.providerId) throw new Error("Start a new conversation to reconnect");
  const env = { fun: "ELEVENLABS_AGENT_ID_FUN", edu: "ELEVENLABS_AGENT_ID_EDU", deep: "ELEVENLABS_AGENT_ID_DEEP" }[c.mode];
  if (!env || process.env[env] !== c.agentId) throw new Error("Agent is not configured for this mode");
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ElevenLabs API key is not configured in Convex");
  const response = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(c.agentId)}`, {
    headers: { "xi-api-key": key }, signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`ElevenLabs session request failed (${response.status})`);
  const result = await response.json();
  if (typeof result.token !== "string" || typeof result.conversation_id !== "string") throw new Error("ElevenLabs did not return a reserved conversation ID");
  await ctx.runMutation(internal.sessions.bind, { id, providerId: result.conversation_id });
  return { token: result.token, conversation_id: result.conversation_id };
} });

export const bind = internalMutation({ args: { id: v.id("conversations"), providerId: v.string() }, handler: async (ctx, args) => {
  const c = await ctx.db.get(args.id);
  if (!c || c.status !== "ready" || c.providerId) throw new Error("Session already issued");
  const active = await ctx.db.query("conversations").withIndex("by_owner_status", q => q.eq("clerkId", c.clerkId).eq("status", "active")).take(20);
  const ending = await ctx.db.query("conversations").withIndex("by_owner_status", q => q.eq("clerkId", c.clerkId).eq("status", "ending")).take(20);
  if ([...active, ...ending].some(s => s.startedAt > Date.now() - 900_000)) throw new Error("Wait for the current conversation to finish processing");
  await ctx.db.patch(args.id, { providerId: args.providerId, status: "active" });
} });
