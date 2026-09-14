import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ValidationError } from "../../../shared/http/errors.js";
import { healthDocs, routeDocs } from "../../../shared/http/openapi.js";
import { ok } from "../../../shared/http/reply.js";
import type { HotelService } from "../application/service.js";

const schema = z.object({
  cityName: z.string().min(1),
  countryCode: z.string().optional(),
  checkIn: z.string(),
  checkOut: z.string(),
  adults: z.number().int().positive().optional(),
  currency: z.string().optional(),
  guestNationality: z.string().optional(),
});

export function createHotelRoutes(service: HotelService): FastifyPluginAsync {
  return async (app) => {
    app.get("/health", { schema: healthDocs("Hotels", "hotels") }, async (_req, reply) => {
      return ok(reply, { module: "hotels", provider: service.providerName });
    });

    app.post(
      "/search",
      {
        schema: routeDocs({
          tags: ["Hotels"],
          summary: "Search hotels",
          description: "Search hotel stays by city and check-in / check-out dates.",
          body: schema,
          bodyExample: {
            cityName: "Osaka",
            countryCode: "JP",
            checkIn: "2026-10-01",
            checkOut: "2026-10-08",
            adults: 2,
            currency: "JPY",
            guestNationality: "ID",
          },
        }),
      },
      async (req, reply) => {
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          throw new ValidationError(parsed.error.issues[0]!.message);
        }
        const hotels = await service.search(parsed.data);
        return ok(reply, { provider: service.providerName, hotels });
      },
    );
  };
}
