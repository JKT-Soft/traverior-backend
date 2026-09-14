import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ValidationError } from "../../../shared/http/errors.js";
import { healthDocs, routeDocs } from "../../../shared/http/openapi.js";
import { ok } from "../../../shared/http/reply.js";
import type { VisaService } from "../application/service.js";

const requirementsSchema = z.object({
  passportCountry: z.string().min(2),
  destinationCountry: z.string().min(2),
  travelDate: z.string().optional(),
});

export function createVisaRoutes(service: VisaService): FastifyPluginAsync {
  return async (app) => {
    app.get("/health", { schema: healthDocs("Visa", "visa") }, async (_req, reply) => {
      return ok(reply, { module: "visa", provider: service.providerName });
    });

    app.post(
      "/requirements",
      {
        schema: routeDocs({
          tags: ["Visa"],
          summary: "Visa requirements",
          description: "Look up visa documents for a passport and destination country.",
          body: requirementsSchema,
          bodyExample: {
            passportCountry: "ID",
            destinationCountry: "JP",
            travelDate: "2026-10-01",
          },
        }),
      },
      async (req, reply) => {
        const parsed = requirementsSchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError("Invalid body");
        return ok(reply, {
          provider: service.providerName,
          requirements: await service.getRequirements(parsed.data),
        });
      },
    );
  };
}
