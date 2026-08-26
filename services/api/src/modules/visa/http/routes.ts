import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ValidationError } from "../../../shared/http/errors.js";
import { ok } from "../../../shared/http/reply.js";
import type { VisaService } from "../application/service.js";

export function createVisaRoutes(service: VisaService): FastifyPluginAsync {
  return async (app) => {
    app.get("/health", async (_req, reply) => {
      return ok(reply, { module: "visa", provider: service.providerName });
    });

    app.post("/requirements", async (req, reply) => {
      const parsed = z
        .object({
          passportCountry: z.string().min(2),
          destinationCountry: z.string().min(2),
          travelDate: z.string().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) throw new ValidationError("Invalid body");
      return ok(reply, {
        provider: service.providerName,
        requirements: await service.getRequirements(parsed.data),
      });
    });
  };
}
