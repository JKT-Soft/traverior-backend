import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ValidationError } from "../../../shared/http/errors.js";
import { healthDocs, routeDocs } from "../../../shared/http/openapi.js";
import { SAMPLE_JAKARTA, SAMPLE_OSAKA } from "../../../shared/http/openapi-examples.js";
import { ok } from "../../../shared/http/reply.js";
import type { RouteService } from "../application/service.js";

const computeSchema = z.object({
  originLat: z.number(),
  originLng: z.number(),
  destinationLat: z.number(),
  destinationLng: z.number(),
  mode: z.enum(["DRIVE", "WALK", "BICYCLE", "TRANSIT"]).optional(),
});

export function createRouteRoutes(service: RouteService): FastifyPluginAsync {
  return async (app) => {
    app.get("/health", { schema: healthDocs("Routes", "routes") }, async (_req, reply) => {
      return ok(reply, { module: "routes", provider: service.providerName });
    });

    app.post(
      "/compute",
      {
        schema: routeDocs({
          tags: ["Routes"],
          summary: "Compute a route",
          description: "Compute travel time and path between two coordinates.",
          body: computeSchema,
          bodyExample: {
            originLat: SAMPLE_JAKARTA.lat,
            originLng: SAMPLE_JAKARTA.lng,
            destinationLat: SAMPLE_OSAKA.lat,
            destinationLng: SAMPLE_OSAKA.lng,
            mode: "TRANSIT",
          },
        }),
      },
      async (req, reply) => {
        const parsed = computeSchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError("Invalid body");
        return ok(reply, {
          provider: service.providerName,
          route: await service.getRoute(parsed.data),
        });
      },
    );
  };
}
