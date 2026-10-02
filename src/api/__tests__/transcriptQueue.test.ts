import { describe, expect, it } from "bun:test";
import { TranscriptQueue, type QueuedTurn } from "../../lib/transcriptQueue";

describe("transcript persistence", () => {
  it("keeps failed turns for retry and coalesces stable event IDs", async () => {
    let fail = true;
    const queue = new TranscriptQueue(async () => fail ? { ok: false, error: { code: "network_error", message: "offline", status: 0 } } : { ok: true, data: {} });
    queue.push({ eventId: "user:1", role: "user", message: "Hello" });
    expect(await queue.flush()).toBe(false);
    expect(queue.size).toBe(1);
    fail = false;
    expect(await queue.flush()).toBe(true);
    expect(queue.size).toBe(0);
  });
  it("persists an interruption correction arriving during a request", async () => {
    const batches: QueuedTurn[][] = [];
    let acknowledge!: () => void;
    const gate = new Promise<void>(resolve => { acknowledge = resolve; });
    const queue = new TranscriptQueue(async turns => {
      batches.push(turns);
      if (batches.length === 1) await gate;
      return { ok: true, data: {} };
    });
    queue.push({ eventId: "agent:1", role: "agent", message: "Original response" });
    const saving = queue.flush();
    queue.push({ eventId: "agent:1", role: "agent", message: "Actually spoken part" });
    acknowledge();
    expect(await saving).toBe(true);
    expect(batches).toHaveLength(2);
    expect(batches[1]![0]!.message).toBe("Actually spoken part");
  });
});
