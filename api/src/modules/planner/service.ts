import { AppError, ValidationError } from "../../shared/http/errors.js";
import type { McpToolClient, McpToolResult, PlannerToolContext } from "../../shared/mcp/index.js";
import type { LlmClient } from "./domain/ports.js";
import {
  TripSkeletonSchema,
  type PlanSkeletonInput,
  type SkeletonCheckpoint,
  type TripSkeleton,
} from "./domain/skeleton.js";
import { normalizeTripSkeleton, type NormalizeSkeletonOptions } from "./domain/normalize-skeleton.js";
import type { FlightService } from "../flights/application/service.js";
import type { HotelService } from "../hotels/application/service.js";
import type { PlaceService } from "../places/application/service.js";
import type { RouteService } from "../routes/application/service.js";
import type { WeatherService } from "../weather/application/service.js";
import type { EventService } from "../events/application/service.js";
import type { VisaService } from "../visa/application/service.js";
import type { ChecklistService } from "../checklist/application/service.js";
import { buildToolPlan } from "./infra/need-tools.js";
import {
  buildReviseDraftUserPrompt,
  buildSkeletonUserPrompt,
  buildSlotExtractUserPrompt,
  REVISE_DRAFT_SYSTEM_PROMPT,
  SLOT_EXTRACT_SYSTEM_PROMPT,
  SKELETON_SYSTEM_PROMPT,
} from "./infra/prompts.js";
import {
  PlanClarificationSchema,
  SlotExtractionSchema,
  type SlotExtraction,
} from "./domain/extract-slots.js";
import type { PlanClarification } from "./domain/clarifications.js";
import type { ApplicationLogService } from "../../shared/logging/application-log.js";
import { APPLICATION_LOG_TYPE } from "../../shared/logging/application-log-types.js";
import { z } from "zod";

const ReviseDraftResponseSchema = z.object({
  reply: z.string().min(1),
  draftChanged: z.boolean().default(false),
  skeleton: TripSkeletonSchema.nullable().optional(),
  clarifications: z.array(PlanClarificationSchema).optional(),
});

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
  logs?: ApplicationLogService;
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
   * Fase 0 — natural language → extracted slots + missing clarifications (no MCP).
   */
  async extractPlanSlots(input: {
    prompt: string;
    preferences?: PlanSkeletonInput["preferences"];
    today?: Date;
  }): Promise<{ llm: string } & SlotExtraction> {
    const prompt = input.prompt?.trim();
    if (!prompt) throw new ValidationError("prompt is required");

    const raw = await this.deps.llm.completeJson({
      temperature: 0,
      maxTokens: 700,
      messages: [
        { role: "system", content: SLOT_EXTRACT_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildSlotExtractUserPrompt({
            prompt,
            preferences: input.preferences,
            today: input.today ?? new Date(),
          }),
        },
      ],
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripCodeFence(raw));
    } catch (parseErr) {
      console.error("[traverior-api:planner] extractPlanSlots invalid JSON", {
        llm: this.deps.llm.name,
        parseError: parseErr instanceof Error ? parseErr.message : String(parseErr),
        rawPreview: raw.length > 600 ? `${raw.slice(0, 600)}…` : raw,
      });
      throw new AppError(502, "LLM returned invalid JSON", "LLM_INVALID_JSON");
    }

    const slots = SlotExtractionSchema.safeParse(parsed);
    if (!slots.success) {
      console.error("[traverior-api:planner] extractPlanSlots schema failed", {
        llm: this.deps.llm.name,
        issue: slots.error.issues[0]?.message,
        path: slots.error.issues[0]?.path,
        parsed,
      });
      throw new AppError(
        502,
        `LLM slot extraction failed validation: ${slots.error.issues[0]?.message ?? "invalid"}`,
        "LLM_INVALID_SLOTS",
      );
    }

    return {
      llm: this.deps.llm.name,
      extracted: slots.data.extracted,
      missing: slots.data.missing,
    };
  }

  /**
   * Fase 1 — natural language → trip skeleton JSON (checkpoints + needs).
   */
  async planSkeleton(
    input: PlanSkeletonInput,
    normalizeOptions: NormalizeSkeletonOptions = {},
    logContext: { tripId?: string; userId?: string } = {},
  ): Promise<{
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
    } catch (parseErr) {
      console.error("[traverior-api:planner] planSkeleton invalid JSON", {
        llm: this.deps.llm.name,
        tripId: logContext.tripId,
        parseError: parseErr instanceof Error ? parseErr.message : String(parseErr),
        rawPreview: raw.length > 600 ? `${raw.slice(0, 600)}…` : raw,
      });
      throw new AppError(502, "LLM returned invalid JSON", "LLM_INVALID_JSON");
    }

    const skeleton = TripSkeletonSchema.safeParse(parsed);
    if (!skeleton.success) {
      console.error("[traverior-api:planner] planSkeleton schema failed", {
        llm: this.deps.llm.name,
        tripId: logContext.tripId,
        issue: skeleton.error.issues[0]?.message,
        path: skeleton.error.issues[0]?.path,
        parsed,
      });
      throw new AppError(
        502,
        `LLM skeleton failed validation: ${skeleton.error.issues[0]?.message ?? "invalid"}`,
        "LLM_INVALID_SKELETON",
      );
    }

    const normalized = normalizeTripSkeleton(skeleton.data, normalizeOptions);
    await this.deps.logs?.record({
      type: APPLICATION_LOG_TYPE.PLAN_SKELETON,
      source: "planner.planSkeleton",
      message: "Plan skeleton created",
      tripId: logContext.tripId,
      userId: logContext.userId,
      payload: {
        prompt,
        preferences: input.preferences,
        llmProvider: this.deps.llm.name,
      },
      result: normalized,
    });

    return {
      skeleton: normalized,
      llm: this.deps.llm.name,
    };
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

  /**
   * Chat revision — text history + live draft → reply and optional updated skeleton.
   * No MCP / provider calls.
   */
  async revisePlanningDraft(input: {
    history: Array<{ role: "user" | "assistant"; content: string }>;
    currentDraft: unknown;
    latestMessage: string;
    stopId?: string;
    preferences?: PlanSkeletonInput["preferences"];
    normalizeOptions?: NormalizeSkeletonOptions;
    logContext?: { tripId?: string; userId?: string };
  }): Promise<{
    reply: string;
    draftChanged: boolean;
    skeleton: TripSkeleton | null;
    clarifications: PlanClarification[];
    llm: string;
  }> {
    const latestMessage = input.latestMessage?.trim();
    if (!latestMessage) throw new ValidationError("latestMessage is required");

    const raw = await this.deps.llm.completeJson({
      temperature: 0.3,
      maxTokens: 1600,
      messages: [
        { role: "system", content: REVISE_DRAFT_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildReviseDraftUserPrompt({
            history: input.history,
            currentDraft: input.currentDraft,
            latestMessage,
            stopId: input.stopId,
            preferences: input.preferences,
          }),
        },
      ],
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripCodeFence(raw));
    } catch (parseErr) {
      console.error("[traverior-api:planner] revisePlanningDraft invalid JSON", {
        llm: this.deps.llm.name,
        tripId: input.logContext?.tripId,
        parseError: parseErr instanceof Error ? parseErr.message : String(parseErr),
        rawPreview: raw.length > 600 ? `${raw.slice(0, 600)}…` : raw,
      });
      throw new AppError(502, "LLM returned invalid JSON", "LLM_INVALID_JSON");
    }

    const result = ReviseDraftResponseSchema.safeParse(parsed);
    if (!result.success) {
      console.error("[traverior-api:planner] revisePlanningDraft schema failed", {
        llm: this.deps.llm.name,
        tripId: input.logContext?.tripId,
        issue: result.error.issues[0]?.message,
        path: result.error.issues[0]?.path,
        parsed,
      });
      throw new AppError(
        502,
        `LLM revise draft failed validation: ${result.error.issues[0]?.message ?? "invalid"}`,
        "LLM_INVALID_SKELETON",
      );
    }

    const skeleton =
      result.data.draftChanged && result.data.skeleton
        ? normalizeTripSkeleton(result.data.skeleton, input.normalizeOptions ?? {})
        : null;

    await this.deps.logs?.record({
      type: APPLICATION_LOG_TYPE.PLAN_SKELETON,
      source: "planner.revisePlanningDraft",
      message: "Planning draft revised",
      tripId: input.logContext?.tripId,
      userId: input.logContext?.userId,
      payload: {
        latestMessage,
        stopId: input.stopId,
        draftChanged: result.data.draftChanged,
        llmProvider: this.deps.llm.name,
      },
      result: {
        reply: result.data.reply,
        skeleton,
        clarifications: result.data.clarifications ?? [],
      },
    });

    return {
      reply: result.data.reply,
      draftChanged: Boolean(skeleton),
      skeleton,
      clarifications: result.data.clarifications ?? [],
      llm: this.deps.llm.name,
    };
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
