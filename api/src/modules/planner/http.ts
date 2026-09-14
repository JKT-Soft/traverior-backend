import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ValidationError } from "../../shared/http/errors.js";
import { routeDocs } from "../../shared/http/openapi.js";
import {
  SAMPLE_DATES,
  SAMPLE_OSAKA,
  SAMPLE_PREFERENCES,
  SAMPLE_SKELETON,
  SAMPLE_TOOL_CONTEXT,
} from "../../shared/http/openapi-examples.js";
import { ok } from "../../shared/http/reply.js";
import { PlanPreferencesSchema, TripSkeletonSchema } from "./domain/skeleton.js";
import type { PlannerService } from "./service.js";

const toolContextSchema = z
  .object({
    originIata: z.string().length(3).optional(),
    destinationIata: z.string().length(3).optional(),
    departureDate: z.string().optional(),
    returnDate: z.string().optional(),
    checkIn: z.string().optional(),
    checkOut: z.string().optional(),
    adults: z.number().int().positive().optional(),
    passportCountry: z.string().optional(),
    originLat: z.number().optional(),
    originLng: z.number().optional(),
    destLat: z.number().optional(),
    destLng: z.number().optional(),
  })
  .optional();

const callToolSchema = z.object({
  tool: z.string().min(1),
  arguments: z.record(z.unknown()).default({}),
});

const skeletonSchema = z.object({
  prompt: z.string().min(1),
  preferences: PlanPreferencesSchema,
});

const executeSkeletonSchema = z.object({
  skeleton: TripSkeletonSchema,
  context: toolContextSchema,
});

const planSchema = z.object({
  prompt: z.string().min(1),
  preferences: PlanPreferencesSchema,
  context: toolContextSchema,
});

const enrichCitySchema = z.object({
  city: z.string().min(1),
  countryCode: z.string().optional(),
  checkIn: z.string(),
  checkOut: z.string(),
  originLat: z.number().optional(),
  originLng: z.number().optional(),
  destLat: z.number().optional(),
  destLng: z.number().optional(),
  passportCountry: z.string().optional(),
  destinationCountry: z.string().optional(),
});

export function createPlannerRoutes(service: PlannerService): FastifyPluginAsync {
  return async (app) => {
    app.get(
      "/tools",
      {
        schema: routeDocs({
          tags: ["Planner"],
          summary: "List planner tools",
          description: "List MCP tools available to the planner.",
        }),
      },
      async (_req, reply) => {
        return ok(reply, { tools: await service.listMcpTools(), mcp: service.mcpName });
      },
    );

    app.post(
      "/tools/call",
      {
        schema: routeDocs({
          tags: ["Planner"],
          summary: "Call a planner tool",
          description: "Invoke a named MCP tool with JSON arguments.",
          body: callToolSchema,
          bodyExample: {
            tool: "search_flights",
            arguments: {
              origin: "CGK",
              destination: "KIX",
              departureDate: SAMPLE_DATES.start,
              adults: 2,
            },
          },
        }),
      },
      async (req, reply) => {
        const parsed = callToolSchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError("Invalid body");
        return ok(reply, await service.callTool(parsed.data.tool, parsed.data.arguments));
      },
    );

    app.post(
      "/skeleton",
      {
        schema: routeDocs({
          tags: ["Planner"],
          summary: "Plan a trip skeleton",
          description: "LLM (or heuristic) skeleton of checkpoints from a prompt.",
          body: skeletonSchema,
          bodyExample: {
            prompt: "7 hari Jepang budget affordable",
            preferences: SAMPLE_PREFERENCES,
          },
        }),
      },
      async (req, reply) => {
        const parsed = skeletonSchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError("Invalid body");
        return ok(reply, await service.planSkeleton(parsed.data));
      },
    );

    app.post(
      "/execute-skeleton",
      {
        schema: routeDocs({
          tags: ["Planner"],
          summary: "Execute skeleton needs",
          description: "Run provider tools for each checkpoint need on an existing skeleton.",
          body: executeSkeletonSchema,
          bodyExample: {
            skeleton: SAMPLE_SKELETON,
            context: SAMPLE_TOOL_CONTEXT,
          },
        }),
      },
      async (req, reply) => {
        const parsed = executeSkeletonSchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError("Invalid body");
        return ok(
          reply,
          await service.executeSkeletonNeeds(parsed.data.skeleton, parsed.data.context ?? {}),
        );
      },
    );

    app.post(
      "/plan",
      {
        schema: routeDocs({
          tags: ["Planner"],
          summary: "Plan and execute",
          description: "Build a skeleton and immediately enrich it with provider tools.",
          body: planSchema,
          bodyExample: {
            prompt: "7 hari Jepang budget affordable",
            preferences: SAMPLE_PREFERENCES,
            context: SAMPLE_TOOL_CONTEXT,
          },
        }),
      },
      async (req, reply) => {
        const parsed = planSchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError("Invalid body");
        return ok(reply, await service.planAndExecute(parsed.data));
      },
    );

    app.post(
      "/enrich-city",
      {
        schema: routeDocs({
          tags: ["Planner"],
          summary: "Enrich a city stop",
          description: "Look up hotels, places, weather, and related data for one city.",
          body: enrichCitySchema,
          bodyExample: {
            city: SAMPLE_OSAKA.city,
            countryCode: "JP",
            checkIn: SAMPLE_DATES.start,
            checkOut: SAMPLE_DATES.end,
            originLat: SAMPLE_TOOL_CONTEXT.originLat,
            originLng: SAMPLE_TOOL_CONTEXT.originLng,
            destLat: SAMPLE_OSAKA.lat,
            destLng: SAMPLE_OSAKA.lng,
            passportCountry: "ID",
            destinationCountry: "JP",
          },
        }),
      },
      async (req, reply) => {
        const parsed = enrichCitySchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError("Invalid body");
        return ok(reply, await service.enrichCity(parsed.data));
      },
    );
  };
}
