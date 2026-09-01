import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ValidationError } from "../../../shared/http/errors.js";
import { ok } from "../../../shared/http/reply.js";
import type { EventService } from "../application/service.js";

export function createEventRoutes(service: EventService): FastifyPluginAsync {
  return async (app) => {
    app.get("/health", async (_req, reply) => {
      return ok(reply, { module: "events", provider: service.providerName });
    });

    app.post("/search", async (req, reply) => {
      const parsed = z
        .object({
          city: z.string().min(1),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          includeFree: z.boolean().optional(),
          includePaid: z.boolean().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) throw new ValidationError("Invalid body");
      return ok(reply, {
        provider: service.providerName,
        events: await service.search(parsed.data),
      });
    });
  };
}
