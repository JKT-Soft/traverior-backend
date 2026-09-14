import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ValidationError } from "../../../shared/http/errors.js";
import { healthDocs, routeDocs } from "../../../shared/http/openapi.js";
import { ok } from "../../../shared/http/reply.js";
import type { ImageService } from "../application/service.js";

const searchSchema = z.object({
  query: z.string().min(1),
  perPage: z.number().int().positive().max(30).optional(),
  orientation: z.enum(["landscape", "portrait", "squarish"]).optional(),
});

const locationSchema = z.object({
  location: z.string().min(1),
  perPage: z.number().int().positive().max(30).optional(),
  orientation: z.enum(["landscape", "portrait", "squarish"]).optional(),
});

export function createImageRoutes(service: ImageService): FastifyPluginAsync {
  return async (app) => {
    app.get("/health", { schema: healthDocs("Images", "images") }, async (_req, reply) => {
      return ok(reply, { module: "images", provider: service.providerName });
    });

    app.post(
      "/search",
      {
        schema: routeDocs({
          tags: ["Images"],
          summary: "Search images",
          description: "Search destination photos by free-text query.",
          body: searchSchema,
          bodyExample: {
            query: "Osaka Castle Japan",
            perPage: 5,
            orientation: "landscape",
          },
        }),
      },
      async (req, reply) => {
        const parsed = searchSchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError("Invalid body");
        return ok(reply, {
          provider: service.providerName,
          images: await service.search(parsed.data),
        });
      },
    );

    app.post(
      "/location",
      {
        schema: routeDocs({
          tags: ["Images"],
          summary: "Images by location",
          description: "Search photos for a named city or landmark.",
          body: locationSchema,
          bodyExample: {
            location: "Osaka",
            perPage: 5,
            orientation: "landscape",
          },
        }),
      },
      async (req, reply) => {
        const parsed = locationSchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError("Invalid body");
        return ok(reply, {
          provider: service.providerName,
          images: await service.searchByLocation(parsed.data.location, {
            perPage: parsed.data.perPage,
            orientation: parsed.data.orientation,
          }),
        });
      },
    );
  };
}
