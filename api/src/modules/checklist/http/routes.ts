import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ValidationError } from "../../../shared/http/errors.js";
import { healthDocs, routeDocs } from "../../../shared/http/openapi.js";
import { ok } from "../../../shared/http/reply.js";
import type { ChecklistService } from "../application/service.js";

const generateSchema = z.object({
  destination: z.string().min(1),
  passportCountry: z.string().optional(),
  visaDocuments: z.array(z.string()).optional(),
});

export function createChecklistRoutes(service: ChecklistService): FastifyPluginAsync {
  return async (app) => {
    app.get("/health", { schema: healthDocs("Checklist", "checklist") }, async (_req, reply) => {
      return ok(reply, { module: "checklist", provider: service.providerName });
    });

    app.post(
      "/generate",
      {
        schema: routeDocs({
          tags: ["Checklist"],
          summary: "Generate checklist",
          description: "Build a packing / prep checklist for a destination.",
          body: generateSchema,
          bodyExample: {
            destination: "Japan",
            passportCountry: "ID",
            visaDocuments: ["passport"],
          },
        }),
      },
      async (req, reply) => {
        const parsed = generateSchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError("Invalid body");
        return ok(reply, { checklist: await service.generate(parsed.data) });
      },
    );
  };
}
