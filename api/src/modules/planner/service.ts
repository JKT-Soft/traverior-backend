import { AppError, ValidationError } from "../../shared/http/errors.js";
import type { McpToolClient, McpToolResult, PlannerToolContext } from "../../shared/mcp/index.js";
import type { LlmClient } from "./domain/ports.js";
import {
  TripSkeletonSchema,
  type PlanSkeletonInput,
  type SkeletonCheckpoint,
  type TripSkeleton,
} from "./domain/skeleton.js";
import type { FlightService } from "../flights/application/service.js";
import type { HotelService } from "../hotels/application/service.js";
import type { PlaceService } from "../places/application/service.js";
import type { RouteService } from "../routes/application/service.js";
import type { WeatherService } from "../weather/application/service.js";
import type { EventService } from "../events/application/service.js";
import type { VisaService } from "../visa/application/service.js";
import type { ChecklistService } from "../checklist/application/service.js";
import { buildToolPlan } from "./infra/need-tools.js";
import { buildSkeletonUserPrompt, SKELETON_SYSTEM_PROMPT } from "./infra/prompts.js";

export type PlannerDeps = {
  llm: LlmClient;
  mcp: McpToolClient;
  flights: FlightService;
  hotels: HotelService;
  places: PlaceService;
  routes: RouteService;
  weather: WeatherService;
  events: EventService;
  visa: VisaService;
  checklist: ChecklistService;
};

export type CheckpointToolResults = {
  checkpoint: SkeletonCheckpoint;
  results: McpToolResult[];
};

/**
 * AI Planner:
 * - Fase 1: LLM skeleton (no tools)
 * - Fase 2: MCP tool execution via shared client (stdio or in-process)
 */
export class PlannerService {
  constructor(private readonly deps: PlannerDeps) {}

  get llmName(): string {
    return this.deps.llm.name;
  }

  get mcpName(): string {
    return this.deps.mcp.name;
  }

  listMcpTools(): Promise<Array<{ name: string; server: string }>> {
    return this.deps.mcp.listTools();
  }

  callTool(tool: string, args: Record<string, unknown>): Promise<McpToolResult> {
    return this.deps.mcp.callTool(tool, args);
  }

  /**
   * Fase 1 — natural language → trip skeleton JSON (checkpoints + needs).
   */
  async planSkeleton(input: PlanSkeletonInput): Promise<{
    skeleton: TripSkeleton;
    llm: string;
  }> {
    const prompt = input.prompt?.trim();
    if (!prompt) throw new ValidationError("prompt is required");

    const raw = await this.deps.llm.completeJson({
      temperature: 0.3,
      maxTokens: 1200,
      messages: [
        { role: "system", content: SKELETON_SYSTEM_PROMPT },
        { role: "user", content: buildSkeletonUserPrompt({ ...input, prompt }) },
      ],
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripCodeFence(raw));
    } catch {
      throw new AppError(502, "LLM returned invalid JSON", "LLM_INVALID_JSON");
    }

    const skeleton = TripSkeletonSchema.safeParse(parsed);
    if (!skeleton.success) {
      throw new AppError(
        502,
        `LLM skeleton failed validation: ${skeleton.error.issues[0]?.message ?? "invalid"}`,
        "LLM_INVALID_SKELETON",
      );
    }

    return { skeleton: skeleton.data, llm: this.deps.llm.name };
  }

  /**
   * Fase 2 — run MCP tools for each checkpoint `needs[]` (parallel per checkpoint).
   */
  async executeSkeletonNeeds(
    skeleton: TripSkeleton,
    context: PlannerToolContext = {},
  ): Promise<{ mcp: string; checkpoints: CheckpointToolResults[] }> {
    const plan = buildToolPlan(skeleton, context);
    const checkpoints = await Promise.all(
      plan.map(async ({ checkpoint, calls }) => {
        const results: McpToolResult[] = [];
        let visaDocuments: string[] | undefined;

        for (const call of calls) {
          const args = { ...call.arguments };
          if (call.tool === "generate_checklist" && visaDocuments?.length) {
            args.visaDocuments = visaDocuments;
          }
          const result = await this.deps.mcp.callTool(call.tool, args);
          results.push(result);
          if (call.tool === "get_visa_requirements" && result.ok) {
            const req = (result.data as { requirements?: { documents?: string[] } })
              ?.requirements;
            visaDocuments = req?.documents;
          }
        }

        return { checkpoint, results };
      }),
    );
    return { mcp: this.deps.mcp.name, checkpoints };
  }

  /** Convenience: skeleton from prompt then execute MCP tools. */
  async planAndExecute(input: PlanSkeletonInput & { context?: PlannerToolContext }) {
    const { skeleton, llm } = await this.planSkeleton(input);
    const execution = await this.executeSkeletonNeeds(skeleton, input.context ?? {});
    return { llm, skeleton, execution };
  }

  async enrichCity(input: {
    city: string;
    countryCode?: string;
    checkIn: string;
    checkOut: string;
    originLat?: number;
    originLng?: number;
    destLat?: number;
    destLng?: number;
    passportCountry?: string;
    destinationCountry?: string;
  }) {
    const ctx: PlannerToolContext = {
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      passportCountry: input.passportCountry,
      originLat: input.originLat,
      originLng: input.originLng,
      destLat: input.destLat,
      destLng: input.destLng,
    };

    const checkpoint: SkeletonCheckpoint = {
      city: input.city,
      countryCode: input.countryCode,
      role: "STAY",
      days: 1,
      needs: ["hotels", "places", "events", "weather", "visa", "checklist"],
    };

    if (input.originLat != null && input.originLng != null && input.destLat != null && input.destLng != null) {
      checkpoint.needs.push("routes");
    }

    const [{ results }] = (
      await this.executeSkeletonNeeds(
        { title: input.city, checkpoints: [checkpoint] },
        ctx,
      )
    ).checkpoints;

    const byTool = Object.fromEntries(results.map((r) => [r.tool, r]));

    const pick = <T>(tool: string, key: string): T | null => {
      const row = byTool[tool];
      if (!row?.ok || !row.data || typeof row.data !== "object") return null;
      return ((row.data as Record<string, unknown>)[key] as T) ?? null;
    };

    return {
      mcp: this.deps.mcp.name,
      hotels: pick("search_hotels", "hotels") ?? [],
      restaurants: pick("search_restaurants", "places") ?? [],
      events: pick("search_events", "events") ?? [],
      weather: pick("get_forecast", "forecast"),
      visa: pick("get_visa_requirements", "requirements"),
      checklist: pick("generate_checklist", "checklist"),
      route: pick("get_route", "route"),
    };
  }
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}
