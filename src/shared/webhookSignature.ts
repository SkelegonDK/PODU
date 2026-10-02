/** Verify the raw bytes before parsing JSON; reject stale and future timestamps. */
export async function verifyWebhook(raw: string, header: string | null, secret: string, now = Date.now()): Promise<boolean> {
  if (!header || !secret) return false;
  const fields = header.split(",").map(s => s.trim());
  const timestamp = fields.find(s => s.startsWith("t="))?.slice(2);
  if (!timestamp || !/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const signatures = fields.filter(s => s.startsWith("v0=")).map(s => s.slice(3));
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  for (const signature of signatures) {
    if (!/^[a-f0-9]{64}$/i.test(signature)) continue;
    const bytes = new Uint8Array(signature.match(/../g)!.map(s => parseInt(s, 16)));
    if (await crypto.subtle.verify("HMAC", key, bytes, encoder.encode(`${timestamp}.${raw}`))) return true;
  }
  return false;
}
