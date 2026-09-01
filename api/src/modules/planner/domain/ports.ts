export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmJsonRequest = {
  messages: LlmMessage[];
  /** Soft cap; provider may map differently */
  maxTokens?: number;
  temperature?: number;
};

/** Minimal chat-completion port used by Planner (no tools in Fase 1). */
export interface LlmClient {
  readonly name: string;
  completeJson(request: LlmJsonRequest): Promise<string>;
}
