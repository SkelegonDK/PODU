import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";

// Keep module paths rooted in the Convex directory, including generated helpers.
const modules = (import.meta as ImportMeta & { glob: (pattern: string) => Record<string, () => Promise<unknown>> }).glob("../convex/**/*.{ts,js}");

describe("Clerk ownership and durable conversations", () => {
  it("rejects anonymous requests and isolates documents and history by identity", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: "user_alice" });
    const bob = t.withIdentity({ subject: "user_bob" });
    await expect(t.query(api.documents.list, {})).rejects.toThrow("authenticated");
    const doc = await alice.mutation(api.documents.save, { name: "notes.md", content: "Private notes" });
    expect(await bob.query(api.documents.list, {})).toEqual([]);
    expect(await bob.query(api.documents.get, { id: doc.id })).toBeNull();
    const id = await alice.mutation(api.conversations.create, { mode: "fun", topics: ["Science"], agentId: "agent_test", saveRecording: false });
    await expect(bob.query(api.conversations.transcript, { id })).rejects.toThrow("not found");
    await expect(bob.mutation(api.conversations.remove, { id })).rejects.toThrow("not found");
    expect(await bob.query(api.conversations.list, {})).toEqual([]);
  });
  it("deduplicates retried transcript batches and invalidates corrected memory", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: "user_alice" });
    const id = await alice.mutation(api.conversations.create, { mode: "edu", topics: ["Science"], agentId: "agent_test", saveRecording: false });
    const batch = { id, turns: [{ eventId: "agent:1", role: "agent" as const, message: "A proposed explanation" }] };
    await alice.mutation(api.conversations.append, batch);
    await alice.mutation(api.conversations.append, batch);
    expect(await alice.query(api.conversations.transcript, { id })).toHaveLength(1);
    await t.mutation(internal.conversations.commitMemory, { id, expectedRevision: 0, cursor: 1, memory: [{ topic: "Science", summary: "A proposed explanation", openQuestions: [], sourceSequences: [1] }], method: "extractive" });
    await alice.mutation(api.conversations.append, { id, turns: [{ ...batch.turns[0]!, message: "Interrupted explanation" }] });
    const c = await alice.query(api.conversations.get, { id });
    expect(c.memoryCursor).toBe(0);
    expect(c.memory).toEqual([]);
    // The old in-flight summary cannot overwrite a transcript correction.
    await t.mutation(internal.conversations.commitMemory, { id, expectedRevision: 1, cursor: 1, memory: [{ topic: "Science", summary: "Stale response", openQuestions: [], sourceSequences: [1] }], method: "extractive" });
    expect((await alice.query(api.conversations.get, { id })).memory).toEqual([]);
  });
  it("accepts provider completion only for the reserved ID and handles retries once", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: "user_alice" });
    const id = await alice.mutation(api.conversations.create, { mode: "deep", topics: ["History"], agentId: "agent_test", saveRecording: false });
    await t.mutation(internal.sessions.bind, { id, providerId: "conv_reserved" });
    const completed = { providerId: "conv_reserved", agentId: "agent_test", durationSeconds: 60, turns: [{ role: "user" as const, message: "Final provider transcript" }] };
    await t.mutation(internal.archive.complete, { ...completed, providerId: "unknown" });
    expect((await alice.query(api.conversations.get, { id })).transcriptFinal).toBeUndefined();
    await t.mutation(internal.archive.complete, completed);
    await t.mutation(internal.archive.complete, completed);
    await alice.mutation(api.conversations.append, { id, turns: [{ eventId: "late:1", role: "agent", message: "Late browser event" }] });
    const turns = await alice.query(api.conversations.transcript, { id });
    expect(turns).toHaveLength(1);
    expect(turns[0]!.message).toBe("Final provider transcript");
    expect((await alice.query(api.conversations.get, { id })).durationSeconds).toBe(60);
  });
  it("deletes associated transcript data", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: "user_alice" });
    const id = await alice.mutation(api.conversations.create, { mode: "fun", topics: ["Science"], agentId: "agent_test", saveRecording: false });
    await alice.mutation(api.conversations.append, { id, turns: [{ eventId: "1", role: "user", message: "Saved" }] });
    await alice.mutation(api.conversations.remove, { id });
    expect(await alice.query(api.conversations.list, {})).toEqual([]);
    expect(await t.run(ctx => ctx.db.query("turns").collect())).toEqual([]);
  });

  it("does not release the active-call limit on a client-only end request", async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({ subject: "user_alice" });
    const args = { mode: "fun", topics: ["Science"], agentId: "agent_test", saveRecording: false };
    const id = await alice.mutation(api.conversations.create, args);
    await t.mutation(internal.sessions.bind, { id, providerId: "reserved_one" });
    await alice.mutation(api.conversations.end, { id });
    expect((await alice.query(api.conversations.get, { id })).status).toBe("ending");
    const second = await alice.mutation(api.conversations.create, args);
    await expect(t.mutation(internal.sessions.bind, { id: second, providerId: "reserved_two" })).rejects.toThrow("processing");
    await expect(alice.mutation(api.conversations.remove, { id })).rejects.toThrow("finish");
    await t.mutation(internal.archive.complete, { providerId: "reserved_one", agentId: "agent_test", durationSeconds: 10, turns: [] });
    await t.mutation(internal.sessions.bind, { id: second, providerId: "reserved_two" });
  });
});
