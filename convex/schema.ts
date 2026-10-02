import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const topicMemory = v.object({
  topic: v.string(), summary: v.string(), openQuestions: v.array(v.string()), sourceSequences: v.array(v.number()),
});

export default defineSchema({
  // Preserve the full-version schema so existing users and history survive.
  users: defineTable({
    clerkId: v.string(), plan: v.union(v.literal("free"), v.literal("casual"), v.literal("regular"), v.literal("deep")),
    minutesUsed: v.number(), freeTrialMinutesUsed: v.number(), billingPeriodStart: v.number(),
  }).index("by_clerkId", ["clerkId"]),
  documents: defineTable({ clerkId: v.string(), name: v.string(), content: v.string(), uploadedAt: v.number() })
    .index("by_clerkId", ["clerkId"]),
  conversations: defineTable({
    clerkId: v.string(), startedAt: v.number(), durationSeconds: v.number(), mode: v.string(), agentId: v.string(),
    topics: v.optional(v.array(v.string())), providerId: v.optional(v.string()),
    status: v.optional(v.union(v.literal("ready"), v.literal("active"), v.literal("ending"), v.literal("ended"), v.literal("failed"))),
    turnCount: v.optional(v.number()), memory: v.optional(v.array(topicMemory)),
    memoryCursor: v.optional(v.number()), memoryScheduled: v.optional(v.boolean()), memoryRevision: v.optional(v.number()),
    memoryMethod: v.optional(v.string()), memoryError: v.optional(v.string()),
    recordingId: v.optional(v.id("_storage")), recordingStatus: v.optional(v.string()),
    transcriptFinal: v.optional(v.boolean()), saveRecording: v.optional(v.boolean()),
  }).index("by_clerkId", ["clerkId"]).index("by_providerId", ["providerId"]).index("by_owner_status", ["clerkId", "status"]),
  turns: defineTable({
    conversationId: v.id("conversations"), sequence: v.number(), eventId: v.string(),
    role: v.union(v.literal("user"), v.literal("agent")), message: v.string(),
  }).index("by_conversation", ["conversationId", "sequence"])
    .index("by_event", ["conversationId", "eventId"]),
});
