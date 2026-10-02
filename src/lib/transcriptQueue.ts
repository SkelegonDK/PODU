import type { ApiResult } from "./poduApi";

export interface QueuedTurn { eventId: string; role: "user" | "agent"; message: string }

/** Retry-safe event IDs, serialized requests, and a bounded batch size. */
export class TranscriptQueue {
  private pending = new Map<string, QueuedTurn>();
  private inflight: Promise<boolean> | null = null;
  constructor(private save: (turns: QueuedTurn[]) => Promise<ApiResult<unknown>>) {}
  push(turn: QueuedTurn) { this.pending.set(turn.eventId, turn); }
  get size() { return this.pending.size; }
  flush(): Promise<boolean> {
    if (this.inflight) return this.inflight;
    const work = async () => {
      while (this.pending.size) {
        const batch = [...this.pending.values()].slice(0, 32);
        let result: ApiResult<unknown>;
        try { result = await this.save(batch); } catch { return false; }
        if (!result.ok) return false;
        // A correction arriving during the request must survive its acknowledgement.
        for (const t of batch) if (this.pending.get(t.eventId) === t) this.pending.delete(t.eventId);
      }
      return true;
    };
    this.inflight = work().finally(() => { this.inflight = null; });
    return this.inflight;
  }
}
