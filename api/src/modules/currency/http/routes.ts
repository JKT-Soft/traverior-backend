import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ValidationError } from "../../../shared/http/errors.js";
import { healthDocs, routeDocs } from "../../../shared/http/openapi.js";
import { ok } from "../../../shared/http/reply.js";
import type { CurrencyService } from "../application/service.js";

const ratesQuerySchema = z.object({
  base: z.string().trim().length(3),
});

export function createCurrencyRoutes(service: CurrencyService): FastifyPluginAsync {
  return async (app) => {
    app.get("/health", { schema: healthDocs("Currency", "currency") }, async (_req, reply) => {
      return ok(reply, { module: "currency", provider: service.providerName });
    });

    app.get(
      "/rates",
      {
        schema: routeDocs({
          tags: ["Currency"],
          summary: "Latest exchange rates",
          description: "Rates expressed as units of each currency per 1 unit of the base currency.",
          querystring: ratesQuerySchema,
          queryExample: { base: "IDR" },
        }),
      },
      async (req, reply) => {
        const parsed = ratesQuerySchema.safeParse(req.query);
        if (!parsed.success) throw new ValidationError("Base currency must be a 3-letter code.");
        return ok(reply, await service.latest(parsed.data.base));
      },
    );
  };
}
