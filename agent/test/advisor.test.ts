// Exercises ClaudeAdvisor through the real Anthropic SDK with a fake HTTP
// layer, so the actual wire request (headers, body) is what gets asserted.
import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import { AdvisorError, type AgentOutput, ClaudeAdvisor, SYSTEM_PROMPT } from "../src/advisor.js";
import { snapshot } from "./fixtures.js";

const OUTPUT: AgentOutput = {
  assessment: "Absorption is healthy; idle share is near target.",
  proposals: [
    { param: "yieldBufferBps", value: "2200", rationale: "Offers absorbed 33,000 USDC from chests vs 80,000 idle." },
  ],
  post: "22 offers in 24h, 71% absorbed by holders and the Shield.",
  feed: "Quiet day. Proposing a slightly larger idle buffer.",
};

function fakeClient(
  respond: (req: { url: string; headers: Headers; body: Record<string, unknown> }) => { status: number; json: unknown },
) {
  const seen: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    const req = {
      url: String(url),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
    };
    seen.push(req);
    const r = respond(req);
    return new Response(JSON.stringify(r.json), {
      status: r.status,
      headers: { "content-type": "application/json", "request-id": "req_test_1" },
    });
  };
  const client = new Anthropic({ apiKey: "test-key", fetch: fetchImpl as typeof fetch, maxRetries: 0 });
  return { client, seen };
}

const message = (over: Record<string, unknown> = {}) => ({
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-opus-5-5",
  content: [{ type: "text", text: JSON.stringify(OUTPUT) }],
  stop_reason: "end_turn",
  stop_sequence: null,
  stop_details: null,
  usage: { input_tokens: 3_000, output_tokens: 900, cache_read_input_tokens: 2_000, cache_creation_input_tokens: 0 },
  ...over,
});

const input = {
  snapshot: snapshot(),
  paramTable: "yieldBufferBps = 2000 bps",
  recentPosts: ["previous post"],
  maxActions: 2,
  maxStepBps: 2_500,
};

describe("ClaudeAdvisor", () => {
  it("sends a structured-output request with server-side fallbacks and parses the reply", async () => {
    const { client, seen } = fakeClient(() => ({ status: 200, json: message() }));
    const adv = new ClaudeAdvisor(client, { model: "claude-opus-5-5", effort: "high" });
    const r = await adv.advise(input);

    expect(r.output).toEqual(OUTPUT);
    expect(r.model).toBe("claude-opus-5-5");
    expect(r.requestId).toBe("req_test_1");
    expect(r.usage).toEqual({ inputTokens: 3_000, outputTokens: 900, cacheReadTokens: 2_000 });

    const req = seen[0]!;
    expect(req.url).toMatch(/\/v1\/messages(\?beta=true)?$/);
    expect(req.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(req.body.model).toBe("claude-opus-5-5");
    expect(req.body.fallbacks).toBe("default");
    expect(req.body.thinking).toBeUndefined();
    const oc = req.body.output_config as {
      effort: string;
      format: { type: string; schema: { properties: Record<string, unknown> } };
    };
    expect(oc.effort).toBe("high");
    expect(oc.format.type).toBe("json_schema");
    expect(Object.keys(oc.format.schema.properties).sort()).toEqual(["assessment", "feed", "post", "proposals"]);
    const system = req.body.system as { text: string; cache_control: unknown }[];
    expect(system[0]!.text).toBe(SYSTEM_PROMPT);
    expect(system[0]!.cache_control).toEqual({ type: "ephemeral" });
    const user = (req.body.messages as { content: string }[])[0]!.content;
    expect(user).toContain('"absorptionRate": 0.71');
    expect(user).toContain("previous post");
  });

  it("reports the serving model after a fallback", async () => {
    const { client } = fakeClient(() => ({ status: 200, json: message({ model: "claude-opus-4-8" }) }));
    const r = await new ClaudeAdvisor(client, { model: "claude-opus-5-5", effort: "high" }).advise(input);
    expect(r.model).toBe("claude-opus-4-8");
  });

  it("turns refusals, truncation and API errors into AdvisorError", async () => {
    const cases: [unknown, number, string][] = [
      [
        message({
          content: [],
          stop_reason: "refusal",
          stop_details: { type: "refusal", category: null, explanation: null },
        }),
        200,
        "refusal",
      ],
      [message({ stop_reason: "max_tokens", content: [{ type: "text", text: '{"assess' }] }), 200, "max_tokens"],
      [{ type: "error", error: { type: "invalid_request_error", message: "bad" } }, 400, "api"],
    ];
    for (const [json, status, code] of cases) {
      const { client } = fakeClient(() => ({ status, json }));
      const err = await new ClaudeAdvisor(client, { model: "claude-opus-5-5", effort: "high" })
        .advise(input)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AdvisorError);
      expect((err as AdvisorError).code).toBe(code);
    }
  });
});
