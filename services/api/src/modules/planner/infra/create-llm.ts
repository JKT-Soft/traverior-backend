import type { Env } from "../../../config/env.js";
import type { LlmClient } from "../domain/ports.js";
import { HeuristicLlmClient } from "./heuristic-llm.js";
import { OpenAiLlmClient } from "./openai-llm.js";

export function createLlmClient(env: Env): LlmClient {
  const provider = env.llm.provider;
  if (provider === "heuristic") {
    return new HeuristicLlmClient();
  }
  if (provider === "openai") {
    if (!env.openaiApiKey) {
      console.warn(
        "[traverior-api:llm] LLM_PROVIDER=openai but OPENAI_API_KEY missing — using heuristic",
      );
      return new HeuristicLlmClient();
    }
    return new OpenAiLlmClient({
      apiKey: env.openaiApiKey,
      model: env.llm.model,
      baseUrl: env.llm.baseUrl,
    });
  }
  throw new Error(`Unknown LLM_PROVIDER: ${provider}`);
}
