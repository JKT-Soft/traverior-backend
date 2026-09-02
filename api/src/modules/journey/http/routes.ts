import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireUser } from "../../auth/require-user.js";
import { ValidationError } from "../../../shared/http/errors.js";
import { ok } from "../../../shared/http/reply.js";
import { PlanPreferencesSchema } from "../../planner/domain/skeleton.js";
import type { JourneyService } from "../application/service.js";

const toolContextSchema = z
  .object({
    originIata: z.string().length(3).optional(),
    destinationIata: z.string().length(3).optional(),
    departureDate: z.string().optional(),
    returnDate: z.string().optional(),
    checkIn: z.string().optional(),
    checkOut: z.string().optional(),
    adults: z.number().int().positive().optional(),
    passportCountry: z.string().optional(),
    originLat: z.number().optional(),
    originLng: z.number().optional(),
    destLat: z.number().optional(),
    destLng: z.number().optional(),
  })
  .optional();

export function createJourneyRoutes(service: JourneyService): FastifyPluginAsync {
  return async (app) => {
    app.get("/", async (req, reply) => {
      const auth = requireUser(req.user);
      const user = await service.ensureUser(auth.uid, auth.email ?? `${auth.uid}@unknown`);
      const trips = await service.listTrips(user.id);
      return ok(reply, { trips });
    });

    app.post("/", async (req, reply) => {
      const auth = requireUser(req.user);
      const user = await service.ensureUser(auth.uid, auth.email ?? `${auth.uid}@unknown`);
      const parsed = z
        .object({
          title: z.string().min(1),
          originCity: z.string().optional(),
          destinationSummary: z.string().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          partySize: z.number().int().positive().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) throw new ValidationError("Invalid body");
      const trip = await service.createTrip({ userId: user.id, ...parsed.data });
      return ok(reply, { trip }, 201);
    });

    app.get<{ Params: { tripId: string } }>("/:tripId", async (req, reply) => {
      const auth = requireUser(req.user);
      const user = await service.ensureUser(auth.uid, auth.email ?? `${auth.uid}@unknown`);
      const trip = await service.getTrip(req.params.tripId, user.id);
      return ok(reply, { trip });
    });

    app.post<{ Params: { tripId: string } }>("/:tripId/plan", async (req, reply) => {
      const auth = requireUser(req.user);
      const user = await service.ensureUser(auth.uid, auth.email ?? `${auth.uid}@unknown`);
      const parsed = z
        .object({
          prompt: z.string().min(1),
          preferences: PlanPreferencesSchema,
          answers: z.record(z.unknown()).optional(),
          context: toolContextSchema,
          executeTools: z.boolean().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) throw new ValidationError("Invalid body");
      const result = await service.planTrip({
        tripId: req.params.tripId,
        userId: user.id,
        ...parsed.data,
      });
      return ok(reply, result);
    });

    app.get<{
      Params: { tripId: string };
      Querystring: { parentId?: string };
    }>("/:tripId/nodes", async (req, reply) => {
      const auth = requireUser(req.user);
      const user = await service.ensureUser(auth.uid, auth.email ?? `${auth.uid}@unknown`);
      const parentId = req.query.parentId;
      const nodes = await service.listChildren(
        req.params.tripId,
        user.id,
        parentId && parentId.length > 0 ? parentId : null,
      );
      return ok(reply, { nodes });
    });

    app.post<{ Params: { tripId: string } }>("/:tripId/nodes", async (req, reply) => {
      const auth = requireUser(req.user);
      const user = await service.ensureUser(auth.uid, auth.email ?? `${auth.uid}@unknown`);
      const parsed = z
        .object({
          parentId: z.string().uuid(),
          type: z.enum([
            "CHECKPOINT",
            "LEG",
            "ACTIVITY",
            "POI",
            "BOOKING",
            "MODULE",
            "LEAF",
          ]),
          title: z.string().min(1),
          contentType: z.string().optional(),
          content: z.record(z.unknown()).optional(),
          costAmount: z.number().optional(),
          costCurrency: z.string().optional(),
          durationMinutes: z.number().int().optional(),
          deepLinkUrl: z.string().url().optional(),
          provider: z.string().optional(),
          providerRef: z.string().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) throw new ValidationError("Invalid body");
      const node = await service.addNode({
        tripId: req.params.tripId,
        userId: user.id,
        ...parsed.data,
        content: parsed.data.content as object | undefined,
        origin: "user",
        isCustom: true,
      });
      return ok(reply, { node }, 201);
    });
  };
}
