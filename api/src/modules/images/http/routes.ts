import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ValidationError } from "../../../shared/http/errors.js";
import { ok } from "../../../shared/http/reply.js";
import type { ImageService } from "../application/service.js";

export function createImageRoutes(service: ImageService): FastifyPluginAsync {
  return async (app) => {
    app.get("/health", async (_req, reply) => {
      return ok(reply, { module: "images", provider: service.providerName });
    });

    app.post("/search", async (req, reply) => {
      const parsed = z
        .object({
          query: z.string().min(1),
          perPage: z.number().int().positive().max(30).optional(),
          orientation: z.enum(["landscape", "portrait", "squarish"]).optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) throw new ValidationError("Invalid body");
      return ok(reply, {
        provider: service.providerName,
        images: await service.search(parsed.data),
      });
    });

    app.post("/location", async (req, reply) => {
      const parsed = z
        .object({
          location: z.string().min(1),
          perPage: z.number().int().positive().max(30).optional(),
          orientation: z.enum(["landscape", "portrait", "squarish"]).optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) throw new ValidationError("Invalid body");
      return ok(reply, {
        provider: service.providerName,
        images: await service.searchByLocation(parsed.data.location, {
          perPage: parsed.data.perPage,
          orientation: parsed.data.orientation,
        }),
      });
    });
  };
}
