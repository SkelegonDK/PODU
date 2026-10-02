import { fetchElevenLabsJson } from "./elevenlabsClient";

const rollback = process.argv.includes("--rollback");
const apply = process.argv.includes("--apply");
const path = `docs/elevenlabs-v4-${rollback ? "rollback" : "profiles"}.json`;
const profiles = await Bun.file(path).json();
for (const mode of ["fun", "edu", "deep"]) {
  const agentId = process.env[`ELEVENLABS_AGENT_ID_${mode.toUpperCase()}`];
  if (!agentId) throw new Error(`Missing agent ID for ${mode}`);
  const body = profiles[mode];
  if (!apply) { console.log(JSON.stringify({ mode, agentId, body }, null, 2)); continue; }
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("Set ELEVENLABS_API_KEY before applying profiles");
  const result = await fetchElevenLabsJson({ path: `/v1/convai/agents/${encodeURIComponent(agentId)}`, method: "PATCH", apiKey, body });
  if (!result.ok) throw new Error(`${mode}: ${result.message}`);
  console.log(`Updated ${mode} agent${rollback ? " to the saved pre-upgrade configuration" : " to v4 Turbo"}.`);
}
if (!apply) console.log("Dry run only. Add --apply to update the agents.");
