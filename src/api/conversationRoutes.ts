import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { backend, HttpError } from "../lib/backend";
import { getAgentForMode, resolveSubjectNames } from "./agents";
import { loadDocumentsForPrompt } from "./knowledgebase";

export async function prepareConversation(req: Request) {
  const body = await req.json();
  if (!["fun", "edu", "deep"].includes(body.mode) || !Array.isArray(body.subjects) || body.subjects.length < 1 || body.subjects.length > 3 ||
      body.subjects.some((s: unknown) => typeof s !== "string" || !["tech", "science", "history", "philosophy", "business", "health", "arts"].includes(s))) {
    throw new HttpError(400, "Select a mode and one to three topics.", "invalid_selection");
  }
  const client = backend(req);
  const topics = resolveSubjectNames(body.subjects);
  const [documents, memory] = client ? await Promise.all([
    client.query(api.documents.forPrompt, {}),
    client.query(api.conversations.recall, { topics, ...(body.resumeId ? { resumeId: body.resumeId as Id<"conversations"> } : {}) }),
  ]) : [loadDocumentsForPrompt(), ""];
  const agent = await getAgentForMode({ mode: body.mode, subjects: body.subjects, documents });
  if (!client) return agent;
  const conversationId = await client.mutation(api.conversations.create, { mode: body.mode, topics, agentId: agent.agentId, saveRecording: body.saveRecording === true });
  return { ...agent, systemPrompt: agent.systemPrompt + memory, conversationId };
}
