import { describe, expect, it } from "bun:test";
import { createHmac } from "node:crypto";
import { verifyWebhook } from "../../shared/webhookSignature";

describe("provider webhook authentication", () => {
  const secret = "a-test-secret-long-enough";
  const raw = '{"type":"post_call_transcription"}';
  const now = 1_800_000_000_000;
  const timestamp = String(now / 1000);
  const signature = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
  it("accepts the signed raw payload", async () => {
    expect(await verifyWebhook(raw, `t=${timestamp},v0=${signature}`, secret, now)).toBe(true);
  });
  it("rejects altered payloads, stale timestamps, and future timestamps", async () => {
    expect(await verifyWebhook(raw + " ", `t=${timestamp},v0=${signature}`, secret, now)).toBe(false);
    expect(await verifyWebhook(raw, `t=${timestamp},v0=${signature}`, secret, now + 301_000)).toBe(false);
    expect(await verifyWebhook(raw, `t=${timestamp},v0=${signature}`, secret, now - 301_000)).toBe(false);
  });
  it("handles rotated signatures and malformed headers", async () => {
    expect(await verifyWebhook(raw, `t=${timestamp},v0=invalid,v0=${signature}`, secret, now)).toBe(true);
    expect(await verifyWebhook(raw, null, secret, now)).toBe(false);
  });
});
