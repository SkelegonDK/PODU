import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export async function userId(ctx: Pick<QueryCtx, "auth">): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  return identity.subject;
}

export async function ownedConversation(ctx: QueryCtx | MutationCtx, id: Id<"conversations">) {
  const owner = await userId(ctx);
  const conversation = await ctx.db.get(id);
  if (!conversation || conversation.clerkId !== owner) throw new Error("Conversation not found");
  return conversation;
}
