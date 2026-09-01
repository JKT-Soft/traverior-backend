import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ValidationError } from "../../../shared/http/errors.js";
import { ok } from "../../../shared/http/reply.js";
import type { RouteService } from "../application/service.js";

export function createRouteRoutes(service: RouteService): FastifyPluginAsync {
  return async (app) => {
    app.get("/health", async (_req, reply) => {
      return ok(reply, { module: "routes", provider: service.providerName });
    });

    app.post("/compute", async (req, reply) => {
      const parsed = z
        .object({
          originLat: z.number(),
          originLng: z.number(),
          destinationLat: z.number(),
          destinationLng: z.number(),
          mode: z.enum(["DRIVE", "WALK", "BICYCLE", "TRANSIT"]).optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) throw new ValidationError("Invalid body");
      return ok(reply, {
        provider: service.providerName,
        route: await service.getRoute(parsed.data),
      });
    });
  };
}
