import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ValidationError } from "../../../shared/http/errors.js";
import { ok } from "../../../shared/http/reply.js";
import type { PlaceService } from "../application/service.js";

export function createPlaceRoutes(service: PlaceService): FastifyPluginAsync {
  return async (app) => {
    app.get("/health", async (_req, reply) => {
      return ok(reply, { module: "places", provider: service.providerName });
    });

    app.post("/search", async (req, reply) => {
      const parsed = z
        .object({
          textQuery: z.string().min(1),
          maxResultCount: z.number().int().positive().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) throw new ValidationError("Invalid body");
      return ok(reply, {
        provider: service.providerName,
        places: await service.search(parsed.data),
      });
    });

    app.post("/restaurants", async (req, reply) => {
      const parsed = z
        .object({ city: z.string().min(1), dietary: z.array(z.string()).optional() })
        .safeParse(req.body);
      if (!parsed.success) throw new ValidationError("Invalid body");
      return ok(reply, {
        provider: service.providerName,
        places: await service.searchRestaurants(parsed.data.city, parsed.data.dietary),
      });
    });
  };
}
