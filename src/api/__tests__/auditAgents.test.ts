import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import { auditAgents } from "../auditAgents";

beforeEach(() => {
  process.env.ELEVENLABS_API_KEY = "test_api_key";
  process.env.ELEVENLABS_AGENT_ID_FUN = "agent_fun_123";
  process.env.ELEVENLABS_AGENT_ID_EDU = "agent_edu_456";
  process.env.ELEVENLABS_AGENT_ID_DEEP = "agent_deep_789";
});

function makeMockAgentConfig(overrides: Record<string, unknown> = {}) {
  const promptOverrides = (overrides.prompt as Record<string, unknown>) || {};
  const ttsOverrides = (overrides.tts as Record<string, unknown>) || {};
  const sttOverrides = (overrides.stt as Record<string, unknown>) || {};

  return {
    name: overrides.name || "Test Agent",
    conversation_config: {
      agent: {
        prompt: {
          llm: {
            provider: "anthropic",
            model: "claude-sonnet-4-20250514",
          },
          tools: [],
          ...promptOverrides,
        },
      },
      tts: {
        model_id: "eleven_v3",
        voice_id: "voice_123",
        ...ttsOverrides,
      },
      stt: {
        model: "scribe_v2",
        ...sttOverrides,
      },
    },
  };
}

// `typeof fetch` carries a `preconnect` property, so a bare arrow function is
// not assignable to it. This wraps an implementation into a valid fetch stub.
function fetchStub(impl: () => Promise<Response>): typeof fetch {
  return Object.assign(impl, { preconnect: () => {} }) as unknown as typeof fetch;
}

// Helper: mock fetch to return a fresh Response each call
function mockFetchWithConfig(config: Record<string, unknown>) {
  return spyOn(globalThis, "fetch").mockImplementation(
    fetchStub(() => Promise.resolve(new Response(JSON.stringify(config), { status: 200 })))
  );
}

describe("auditAgents", () => {
  it("fetches agent configs for all three modes", async () => {
    const mockFetch = mockFetchWithConfig(makeMockAgentConfig());

    const report = await auditAgents();

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(report.results).toHaveLength(3);
    expect(report.results.map(r => r.mode)).toEqual(["fun", "edu", "deep"]);

    mockFetch.mockRestore();
  });

  it("reports no issues for up-to-date agents", async () => {
    const mockFetch = mockFetchWithConfig(makeMockAgentConfig());

    const report = await auditAgents();
    expect(report.summary.withIssues).toBe(0);

    mockFetch.mockRestore();
  });

  it("flags deprecated prompt.tools usage", async () => {
    const config = makeMockAgentConfig({
      prompt: { tools: [{ name: "old_tool" }] },
    });
    const mockFetch = mockFetchWithConfig(config);

    const report = await auditAgents();
    const agentsWithToolIssues = report.results.filter(r =>
      r.issues.some(i => i.includes("deprecated prompt.tools"))
    );
    expect(agentsWithToolIssues.length).toBe(3);

    mockFetch.mockRestore();
  });

  it("flags outdated TTS models", async () => {
    const config = makeMockAgentConfig({
      tts: { model_id: "eleven_monolingual_v1" },
    });
    const mockFetch = mockFetchWithConfig(config);

    const report = await auditAgents();
    const agentsWithTtsIssues = report.results.filter(r =>
      r.issues.some(i => i.includes("TTS model"))
    );
    expect(agentsWithTtsIssues.length).toBe(3);

    mockFetch.mockRestore();
  });

  it("understands v4 Turbo and the current string LLM configuration", async () => {
    const mockFetch = mockFetchWithConfig(makeMockAgentConfig({ tts: { model_id: "eleven_v4_turbo" }, prompt: { llm: "gemini-2.5-flash-lite", tools: [{ type: "system", name: "end_call", params: { system_tool_type: "end_call" } }] } }));
    const report = await auditAgents();
    expect(report.summary.withIssues).toBe(0);
    expect(report.results[0]!.llmModel).toBe("gemini-2.5-flash-lite");
    expect(report.results[0]!.hasDeprecatedTools).toBe(false);
    mockFetch.mockRestore();
  });

  it("handles API errors gracefully", async () => {
    const mockFetch = spyOn(globalThis, "fetch").mockImplementation(
      fetchStub(() =>
        Promise.resolve(new Response("Unauthorized", { status: 401, statusText: "Unauthorized" }))
      )
    );

    const report = await auditAgents();

    expect(report.results).toHaveLength(3);
    for (const result of report.results) {
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]).toContain("401");
    }

    mockFetch.mockRestore();
  });

  it("records a network rejection as an issue instead of throwing", async () => {
    const mockFetch = spyOn(globalThis, "fetch").mockImplementation(
      fetchStub(() => Promise.reject(new TypeError("Unable to connect")))
    );

    const report = await auditAgents();

    expect(report.results).toHaveLength(3);
    for (const result of report.results) {
      expect(result.issues[0]).toContain("Could not reach ElevenLabs");
    }

    mockFetch.mockRestore();
  });

  it("sends encoded agent URLs with the xi-api-key header", async () => {
    const mockFetch = mockFetchWithConfig(makeMockAgentConfig());

    await auditAgents();

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.elevenlabs.io/v1/convai/agents/agent_fun_123",
      {
        method: "GET",
        headers: { "xi-api-key": "test_api_key" },
        signal: expect.any(AbortSignal),
      }
    );

    mockFetch.mockRestore();
  });

  it("accepts an explicit API key overriding the environment", async () => {
    const mockFetch = mockFetchWithConfig(makeMockAgentConfig());

    await auditAgents("explicit_key");

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("explicit_key");

    mockFetch.mockRestore();
  });

  it("handles missing agent IDs", async () => {
    delete process.env.ELEVENLABS_AGENT_ID_FUN;

    const mockFetch = mockFetchWithConfig(makeMockAgentConfig());

    const report = await auditAgents();

    const funResult = report.results.find(r => r.mode === "fun");
    expect(funResult).toBeDefined();
    expect(funResult!.issues).toContain("Environment variable ELEVENLABS_AGENT_ID_FUN is not set");

    mockFetch.mockRestore();
  });

  it("throws when API key is missing", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    await expect(auditAgents()).rejects.toThrow("ELEVENLABS_API_KEY");
  });

  it("includes timestamp in report", async () => {
    const mockFetch = mockFetchWithConfig(makeMockAgentConfig());

    const report = await auditAgents();
    expect(report.timestamp).toBeTruthy();
    expect(new Date(report.timestamp).getTime()).not.toBeNaN();

    mockFetch.mockRestore();
  });
});
