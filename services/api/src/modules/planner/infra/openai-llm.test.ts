import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../../../shared/http/errors.js";
import { OpenAiLlmClient } from "./openai-llm.js";
import { HeuristicLlmClient } from "./heuristic-llm.js";
import { createLlmClient } from "./create-llm.js";
import type { Env } from "../../../config/env.js";

function envSlice(partial: Partial<Env> & { openaiApiKey?: string; llm: Env["llm"] }): Env {
  return {
    port: 3000,
    nodeEnv: "test",
    authMode: "dev",
    databaseUrl: "postgresql://x",
    logDir: "logs",
    logLevel: "info",
    cache: {
      enabled: false,
      ttl: {
        flights: 1,
        hotels: 1,
        places: 1,
        routes: 1,
        weather: 1,
        events: 1,
        visa: 1,
        trips: 1,
      },
    },
    providers: {
      flights: "mock",
      hotels: "mock",
      places: "mock",
      routes: "mock",
      weather: "mock",
      events: "mock",
      visa: "static",
    },
    secrets: {},
    ...partial,
  };
}

describe("OpenAiLlmClient", () => {
  it("posts chat completions and returns content", async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"ok":true}' } }],
        }),
        { status: 200 },
      );
    const client = new OpenAiLlmClient({
      apiKey: "sk-test",
      model: "gpt-4o-mini",
      fetchImpl: fetchImpl as typeof fetch,
    });
    const text = await client.completeJson({
      messages: [{ role: "user", content: "hi" }],
    });
    assert.equal(text, '{"ok":true}');
  });

  it("maps upstream errors", async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ error: { message: "quota" } }), { status: 429 });
    const client = new OpenAiLlmClient({
      apiKey: "sk-test",
      fetchImpl: fetchImpl as typeof fetch,
    });
    await assert.rejects(
      () => client.completeJson({ messages: [{ role: "user", content: "x" }] }),
      (err: unknown) => err instanceof AppError && err.code === "LLM_UPSTREAM_ERROR",
    );
  });

  it("rejects empty content", async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), {
        status: 200,
      });
    const client = new OpenAiLlmClient({
      apiKey: "sk-test",
      fetchImpl: fetchImpl as typeof fetch,
    });
    await assert.rejects(
      () => client.completeJson({ messages: [{ role: "user", content: "x" }] }),
      AppError,
    );
  });
});

describe("HeuristicLlmClient", () => {
  it("builds japan skeleton", async () => {
    const client = new HeuristicLlmClient();
    const raw = await client.completeJson({
      messages: [
        { role: "system", content: "sys" },
        {
          role: "user",
          content: 'prompt Jepang\n{"originCity":"Jakarta","partySize": 2}',
        },
      ],
    });
    const parsed = JSON.parse(raw) as { checkpoints: unknown[] };
    assert.ok(parsed.checkpoints.length >= 2);
  });
});

describe("createLlmClient", () => {
  it("returns heuristic when configured", () => {
    const client = createLlmClient(
      envSlice({ llm: { provider: "heuristic", model: "gpt-4o-mini" } }),
    );
    assert.ok(client instanceof HeuristicLlmClient);
  });

  it("returns openai when key present", () => {
    const client = createLlmClient(
      envSlice({
        openaiApiKey: "sk-x",
        llm: { provider: "openai", model: "gpt-4o-mini" },
      }),
    );
    assert.ok(client instanceof OpenAiLlmClient);
  });

  it("falls back to heuristic when openai selected without key", () => {
    const client = createLlmClient(
      envSlice({
        openaiApiKey: undefined,
        llm: { provider: "openai", model: "gpt-4o-mini" },
      }),
    );
    assert.ok(client instanceof HeuristicLlmClient);
  });
});
