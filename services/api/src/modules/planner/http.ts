import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ValidationError } from "../../shared/http/errors.js";
import { ok } from "../../shared/http/reply.js";
import type { PlannerService } from "./service.js";

export function createPlannerRoutes(service: PlannerService): FastifyPluginAsync {
  return async (app) => {
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
