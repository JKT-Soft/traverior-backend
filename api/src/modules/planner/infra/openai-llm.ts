import { AppError } from "../../../shared/http/errors.js";
import type { LlmClient, LlmJsonRequest } from "../domain/ports.js";

export type OpenAiLlmOptions = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

type OpenAiChatResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
};

export class OpenAiLlmClient implements LlmClient {
  readonly name = "openai";
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAiLlmOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "gpt-4o-mini";
    this.baseUrl = (options.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async completeJson(request: LlmJsonRequest): Promise<string> {
    const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        temperature: request.temperature ?? 0.3,
        max_tokens: request.maxTokens ?? 1200,
        response_format: { type: "json_object" },
        messages: request.messages,
      }),
    });

    const raw = await res.text();
    let body: OpenAiChatResponse;
    try {
      body = JSON.parse(raw) as OpenAiChatResponse;
    } catch {
      console.error("[traverior-api:openai] non-JSON response", {
        status: res.status,
        model: this.model,
        bodyPreview: raw.length > 400 ? `${raw.slice(0, 400)}…` : raw,
      });
      throw new AppError(502, `OpenAI returned non-JSON (${res.status})`, "LLM_UPSTREAM_ERROR");
    }

    if (!res.ok) {
      console.error("[traverior-api:openai] upstream error", {
        status: res.status,
        model: this.model,
        message: body.error?.message ?? `OpenAI error ${res.status}`,
        bodyPreview: raw.length > 400 ? `${raw.slice(0, 400)}…` : raw,
      });
      throw new AppError(
        502,
        body.error?.message ?? `OpenAI error ${res.status}`,
        "LLM_UPSTREAM_ERROR",
      );
    }

    const content = body.choices?.[0]?.message?.content?.trim();
    if (!content) {
      console.error("[traverior-api:openai] empty content", {
        status: res.status,
        model: this.model,
        bodyPreview: raw.length > 400 ? `${raw.slice(0, 400)}…` : raw,
      });
      throw new AppError(502, "OpenAI returned empty content", "LLM_UPSTREAM_ERROR");
    }
    return content;
  }
}
