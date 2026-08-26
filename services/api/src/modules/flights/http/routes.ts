import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ValidationError } from "../../../shared/http/errors.js";
import { ok } from "../../../shared/http/reply.js";
import type { FlightService } from "../application/service.js";

const searchSchema = z.object({
  origin: z.string().min(3).max(3),
  destination: z.string().min(3).max(3),
  departureDate: z.string(),
  returnDate: z.string().optional(),
  adults: z.number().int().positive().optional(),
  cabinClass: z
    .enum(["economy", "premium_economy", "business", "first"])
    .optional(),
});

export function createFlightRoutes(service: FlightService): FastifyPluginAsync {
  return async (app) => {
    app.get("/health", async (_req, reply) => {
      return ok(reply, { module: "flights", provider: service.providerName });
    });

    app.post("/search", async (req, reply) => {
      const parsed = searchSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0]!.message);
      }
      const offers = await service.search(parsed.data);
      return ok(reply, { provider: service.providerName, offers });
    });
  };
}
