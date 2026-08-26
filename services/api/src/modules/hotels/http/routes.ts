import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ValidationError } from "../../../shared/http/errors.js";
import { ok } from "../../../shared/http/reply.js";
import type { HotelService } from "../application/service.js";

const schema = z.object({
  cityName: z.string().min(1),
  countryCode: z.string().optional(),
  checkIn: z.string(),
  checkOut: z.string(),
  adults: z.number().int().positive().optional(),
  currency: z.string().optional(),
  guestNationality: z.string().optional(),
});

export function createHotelRoutes(service: HotelService): FastifyPluginAsync {
  return async (app) => {
    app.get("/health", async (_req, reply) => {
      return ok(reply, { module: "hotels", provider: service.providerName });
    });

    app.post("/search", async (req, reply) => {
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0]!.message);
      }
      const hotels = await service.search(parsed.data);
      return ok(reply, { provider: service.providerName, hotels });
    });
  };
}
