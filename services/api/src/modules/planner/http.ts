import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ValidationError } from "../../shared/http/errors.js";
import { ok } from "../../shared/http/reply.js";
import { TripSkeletonSchema } from "./domain/skeleton.js";
import type { PlannerService } from "./service.js";

const preferencesSchema = z
  .object({
    originCity: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    partySize: z.number().int().positive().optional(),
    budgetTone: z.enum(["budget", "mid", "luxury"]).optional(),
    pace: z.enum(["relaxed", "moderate", "packed"]).optional(),
    passportCountry: z.string().optional(),
  })
  .optional();

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

export function createPlannerRoutes(service: PlannerService): FastifyPluginAsync {
  return async (app) => {
    app.get("/tools", async (_req, reply) => {
      return ok(reply, { tools: await service.listMcpTools(), mcp: service.mcpName });
    });

    app.post("/tools/call", async (req, reply) => {
      const parsed = z
        .object({
          tool: z.string().min(1),
          arguments: z.record(z.unknown()).default({}),
        })
        .safeParse(req.body);
      if (!parsed.success) throw new ValidationError("Invalid body");
      return ok(reply, await service.callTool(parsed.data.tool, parsed.data.arguments));
    });

    app.post("/skeleton", async (req, reply) => {
      const parsed = z
        .object({
          prompt: z.string().min(1),
          preferences: preferencesSchema,
        })
        .safeParse(req.body);
      if (!parsed.success) throw new ValidationError("Invalid body");
      return ok(reply, await service.planSkeleton(parsed.data));
    });

    app.post("/execute-skeleton", async (req, reply) => {
      const parsed = z
        .object({
          skeleton: TripSkeletonSchema,
          context: toolContextSchema,
        })
        .safeParse(req.body);
      if (!parsed.success) throw new ValidationError("Invalid body");
      return ok(
        reply,
        await service.executeSkeletonNeeds(parsed.data.skeleton, parsed.data.context ?? {}),
      );
    });

    app.post("/plan", async (req, reply) => {
      const parsed = z
        .object({
          prompt: z.string().min(1),
          preferences: preferencesSchema,
          context: toolContextSchema,
        })
        .safeParse(req.body);
      if (!parsed.success) throw new ValidationError("Invalid body");
      return ok(reply, await service.planAndExecute(parsed.data));
    });

    app.post("/enrich-city", async (req, reply) => {
      const parsed = z
        .object({
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
        })
        .safeParse(req.body);
      if (!parsed.success) throw new ValidationError("Invalid body");
      return ok(reply, await service.enrichCity(parsed.data));
    });
  };
}
