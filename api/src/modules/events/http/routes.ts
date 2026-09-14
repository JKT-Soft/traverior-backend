import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ValidationError } from "../../../shared/http/errors.js";
import { healthDocs, routeDocs } from "../../../shared/http/openapi.js";
import { SAMPLE_DATES, SAMPLE_OSAKA } from "../../../shared/http/openapi-examples.js";
import { ok } from "../../../shared/http/reply.js";
import type { EventService } from "../application/service.js";

const searchSchema = z.object({
  city: z.string().min(1),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  includeFree: z.boolean().optional(),
  includePaid: z.boolean().optional(),
});

export function createEventRoutes(service: EventService): FastifyPluginAsync {
  return async (app) => {
    app.get("/health", { schema: healthDocs("Events", "events") }, async (_req, reply) => {
      return ok(reply, { module: "events", provider: service.providerName });
    });

    app.post(
      "/search",
      {
        schema: routeDocs({
          tags: ["Events"],
          summary: "Search events",
          description: "Search local events and activities in a city.",
          body: searchSchema,
          bodyExample: {
            city: SAMPLE_OSAKA.city,
            startDate: SAMPLE_DATES.start,
            endDate: SAMPLE_DATES.end,
            includeFree: true,
            includePaid: true,
          },
        }),
      },
      async (req, reply) => {
        const parsed = searchSchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError("Invalid body");
        return ok(reply, {
          provider: service.providerName,
          events: await service.search(parsed.data),
        });
      },
    );
  };
}
