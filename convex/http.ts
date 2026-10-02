import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { verifyWebhook } from "../src/shared/webhookSignature";

const http = httpRouter();
http.route({ path: "/webhooks/elevenlabs", method: "POST", handler: httpAction(async (ctx, req) => {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook not configured", { status: 503 });
  const raw = await req.text();
  if (raw.length > 3_000_000) return new Response("Payload too large", { status: 413 });
  if (!await verifyWebhook(raw, req.headers.get("elevenlabs-signature"), secret)) return new Response("Invalid signature", { status: 401 });
  let event;
  try { event = JSON.parse(raw); } catch { return new Response("Invalid JSON", { status: 400 }); }
  if (event.type !== "post_call_transcription") return Response.json({ received: true });
  const data = event.data;
  if (typeof data?.conversation_id !== "string" || typeof data?.agent_id !== "string" || !Array.isArray(data?.transcript) || data.transcript.length > 4000) return new Response("Invalid conversation", { status: 400 });
  const turns = data.transcript.filter((t: { message?: unknown; role?: unknown }) => typeof t.message === "string" && ["user", "agent"].includes(String(t.role)))
    .map((t: { message: string; role: "user" | "agent" }) => ({ role: t.role, message: t.message.slice(0, 8000) }));
  await ctx.runMutation(internal.archive.complete, { providerId: data.conversation_id, agentId: data.agent_id, turns,
    durationSeconds: Math.max(0, Math.min(Number(data.metadata?.call_duration_secs) || 0, 86400)) });
  return Response.json({ received: true });
}) });
export default http;
