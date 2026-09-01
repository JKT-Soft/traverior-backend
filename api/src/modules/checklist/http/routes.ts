import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ValidationError } from "../../../shared/http/errors.js";
import { ok } from "../../../shared/http/reply.js";
import type { ChecklistService } from "../application/service.js";

export function createChecklistRoutes(service: ChecklistService): FastifyPluginAsync {
  return async (app) => {
    app.get("/health", async (_req, reply) => {
      return ok(reply, { module: "checklist", provider: service.providerName });
    });

    app.post("/generate", async (req, reply) => {
      const parsed = z
        .object({
          destination: z.string().min(1),
          passportCountry: z.string().optional(),
          visaDocuments: z.array(z.string()).optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) throw new ValidationError("Invalid body");
      return ok(reply, { checklist: await service.generate(parsed.data) });
    });
  };
}
