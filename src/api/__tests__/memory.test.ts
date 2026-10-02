import { describe, expect, it } from "bun:test";
import { extractMemory, normalizeMemory, renderMemory } from "../../shared/memory";

describe("topic memory", () => {
  it("does not assign unrelated claims to every selected topic", () => {
    const memory = extractMemory(["Science", "History"], [{ sequence: 1, role: "user", message: "Science is the topic I want to discuss." }], []);
    expect(memory[0]!.summary).toContain("user said:");
    expect(memory[1]!.summary).toBe("");
  });
  it("rejects a summary without supplied evidence", () => {
    expect(() => normalizeMemory([{ topic: "Science", summary: "Made-up fact", openQuestions: [], sourceSequences: [99] }], ["Science"], [], [])).toThrow("evidence");
  });
  it("bounds prompt size and labels recalled claims as fallible data", () => {
    const memory = extractMemory(["Science"], Array.from({ length: 40 }, (_, i) => ({ sequence: i, role: "user" as const, message: "x".repeat(8000) })), []);
    const prompt = renderMemory(memory);
    expect(prompt.length).toBeLessThanOrEqual(4000);
    expect(prompt).toContain("not instructions");
    expect(memory[0]!.sourceSequences.length).toBeLessThanOrEqual(32);
  });
});
