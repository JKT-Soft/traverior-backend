import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { NotFoundError, ValidationError } from "../../../shared/http/errors.js";
import { healthDocs, routeDocs } from "../../../shared/http/openapi.js";
import { ok } from "../../../shared/http/reply.js";
import type { FlightService } from "../application/service.js";

const cabinClassSchema = z.enum(["economy", "premium_economy", "business", "first"]);

const searchSchema = z.object({
  origin: z.string().min(3).max(3),
  destination: z.string().min(3).max(3),
  departureDate: z.string(),
  returnDate: z.string().optional(),
  adults: z.number().int().positive().optional(),
  cabinClass: cabinClassSchema.optional(),
});

const offerDetailSchema = z
  .object({
    providerRef: z.string().min(1).optional(),
    bookingToken: z.string().min(1).optional(),
    origin: z.string().min(3).max(3).optional(),
    destination: z.string().min(3).max(3).optional(),
    departureDate: z.string().optional(),
    returnDate: z.string().optional(),
    adults: z.number().int().positive().optional(),
    cabinClass: cabinClassSchema.optional(),
    flightNumber: z.string().min(1).optional(),
    currency: z.string().min(3).max(3).optional(),
  })
  .refine(
    (value) =>
      Boolean(value.bookingToken) ||
      Boolean(value.providerRef) ||
      (Boolean(value.origin) && Boolean(value.destination) && Boolean(value.departureDate)),
    {
      message:
        "Provide bookingToken, providerRef, or origin+destination+departureDate",
    },
  );

export function createFlightRoutes(service: FlightService): FastifyPluginAsync {
  return async (app) => {
    app.get("/health", { schema: healthDocs("Flights", "flights") }, async (_req, reply) => {
      return ok(reply, { module: "flights", provider: service.providerName });
    });

    app.post(
      "/search",
      {
        schema: routeDocs({
          tags: ["Flights"],
          summary: "Search flights",
          description: "Search flight offers by origin, destination, and dates.",
          body: searchSchema,
          bodyExample: {
            origin: "CGK",
            destination: "KIX",
            departureDate: "2026-10-01",
            returnDate: "2026-10-08",
            adults: 2,
            cabinClass: "economy",
          },
        }),
      },
      async (req, reply) => {
        const parsed = searchSchema.safeParse(req.body);
        if (!parsed.success) {
          throw new ValidationError(parsed.error.issues[0]!.message);
        }
        const offers = await service.search(parsed.data);
        return ok(reply, { provider: service.providerName, offers });
      },
    );

    app.post(
      "/offers/detail",
      {
        schema: routeDocs({
          tags: ["Flights"],
          summary: "Flight offer detail + booking options",
          description:
            "Resolve a selected flight offer and return booking options (Google Flights vendors / deep links), similar to the Google Flights booking page after Select flight.",
          body: offerDetailSchema,
          bodyExample: {
            origin: "CGK",
            destination: "SIN",
            departureDate: "2026-12-04",
            flightNumber: "TR275",
            bookingToken: "CjRI...",
            currency: "USD",
          },
        }),
      },
      async (req, reply) => {
        const parsed = offerDetailSchema.safeParse(req.body);
        if (!parsed.success) {
          throw new ValidationError(parsed.error.issues[0]!.message);
        }
        const detail = await service.getOfferDetail(parsed.data);
        if (!detail) {
          throw new NotFoundError("Flight offer not found");
        }
        return ok(reply, {
          provider: service.providerName,
          offer: detail.offer,
          bookingOptions: detail.bookingOptions,
        });
      },
    );
  };
}
