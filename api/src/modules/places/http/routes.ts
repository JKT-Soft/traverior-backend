import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ValidationError } from "../../../shared/http/errors.js";
import { healthDocs, routeDocs } from "../../../shared/http/openapi.js";
import { ok } from "../../../shared/http/reply.js";
import type { PlaceService } from "../application/service.js";

const searchSchema = z.object({
  textQuery: z.string().min(1),
  maxResultCount: z.number().int().positive().optional(),
});

const restaurantsSchema = z.object({
  city: z.string().min(1),
  dietary: z.array(z.string()).optional(),
});

export function createPlaceRoutes(service: PlaceService): FastifyPluginAsync {
  return async (app) => {
    app.get("/health", { schema: healthDocs("Places", "places") }, async (_req, reply) => {
      return ok(reply, { module: "places", provider: service.providerName });
    });

    app.post(
      "/search",
      {
        schema: routeDocs({
          tags: ["Places"],
          summary: "Search places",
          description: "Text search for points of interest.",
          body: searchSchema,
          bodyExample: {
            textQuery: "Osaka Castle",
            maxResultCount: 5,
          },
        }),
      },
      async (req, reply) => {
        const parsed = searchSchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError("Invalid body");
        return ok(reply, {
          provider: service.providerName,
          places: await service.search(parsed.data),
        });
      },
    );

    app.post(
      "/restaurants",
      {
        schema: routeDocs({
          tags: ["Places"],
          summary: "Search restaurants",
          description: "Find restaurants in a city, optionally filtered by diet.",
          body: restaurantsSchema,
          bodyExample: {
            city: "Osaka",
            dietary: ["halal"],
          },
        }),
      },
      async (req, reply) => {
        const parsed = restaurantsSchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError("Invalid body");
        return ok(reply, {
          provider: service.providerName,
          places: await service.searchRestaurants(parsed.data.city, parsed.data.dietary),
        });
      },
    );
  };
}
