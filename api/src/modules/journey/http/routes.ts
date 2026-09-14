import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireUser } from "../../auth/require-user.js";
import { ValidationError } from "../../../shared/http/errors.js";
import { routeDocs } from "../../../shared/http/openapi.js";
import {
  SAMPLE_DATES,
  SAMPLE_JAKARTA,
  SAMPLE_NODE_ID,
  SAMPLE_PREFERENCES,
  SAMPLE_TOOL_CONTEXT,
  SAMPLE_TRIP_ID,
} from "../../../shared/http/openapi-examples.js";
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

const tripIdParams = z.object({ tripId: z.string().min(1) });

const createTripSchema = z.object({
  title: z.string().min(1),
  originCity: z.string().optional(),
  destinationSummary: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  partySize: z.number().int().positive().optional(),
});

const planTripSchema = z.object({
  prompt: z.string().min(1),
  preferences: PlanPreferencesSchema,
  answers: z.record(z.unknown()).optional(),
  context: toolContextSchema,
  executeTools: z.boolean().optional(),
});

const listNodesQuery = z.object({
  parentId: z.string().optional(),
});

const addNodeSchema = z.object({
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
});

export function createJourneyRoutes(service: JourneyService): FastifyPluginAsync {
  return async (app) => {
    app.get(
      "/",
      {
        schema: routeDocs({
          tags: ["Trips"],
          summary: "List trips",
          description: "List journeys for the authenticated user.",
        }),
      },
      async (req, reply) => {
        const auth = requireUser(req.user);
        const user = await service.ensureUser(auth.uid, auth.email ?? `${auth.uid}@unknown`);
        const trips = await service.listTrips(user.id);
        return ok(reply, { trips });
      },
    );

    app.post(
      "/",
      {
        schema: routeDocs({
          tags: ["Trips"],
          summary: "Create a trip",
          description: "Create an empty journey to plan later.",
          body: createTripSchema,
          bodyExample: {
            title: "Japan Adventure",
            originCity: SAMPLE_JAKARTA.city,
            destinationSummary: "Osaka, Kyoto, Tokyo",
            startDate: SAMPLE_DATES.start,
            endDate: SAMPLE_DATES.end,
            partySize: 2,
          },
          statusCodes: [201],
        }),
      },
      async (req, reply) => {
        const auth = requireUser(req.user);
        const user = await service.ensureUser(auth.uid, auth.email ?? `${auth.uid}@unknown`);
        const parsed = createTripSchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError("Invalid body");
        const trip = await service.createTrip({ userId: user.id, ...parsed.data });
        return ok(reply, { trip }, 201);
      },
    );

    app.get<{ Params: { tripId: string } }>(
      "/:tripId",
      {
        schema: routeDocs({
          tags: ["Trips"],
          summary: "Get a trip",
          description: "Load a journey and its pipeline tree.",
          params: tripIdParams,
          paramsExample: { tripId: SAMPLE_TRIP_ID },
        }),
      },
      async (req, reply) => {
        const auth = requireUser(req.user);
        const user = await service.ensureUser(auth.uid, auth.email ?? `${auth.uid}@unknown`);
        const trip = await service.getTrip(req.params.tripId, user.id);
        return ok(reply, { trip });
      },
    );

    app.post<{ Params: { tripId: string } }>(
      "/:tripId/plan",
      {
        schema: routeDocs({
          tags: ["Trips"],
          summary: "Plan a trip",
          description: "Run the planner and persist pipeline nodes onto the journey.",
          params: tripIdParams,
          paramsExample: { tripId: SAMPLE_TRIP_ID },
          body: planTripSchema,
          bodyExample: {
            prompt: "7 hari Jepang budget affordable",
            preferences: SAMPLE_PREFERENCES,
            context: SAMPLE_TOOL_CONTEXT,
            executeTools: true,
          },
        }),
      },
      async (req, reply) => {
        const auth = requireUser(req.user);
        const user = await service.ensureUser(auth.uid, auth.email ?? `${auth.uid}@unknown`);
        const parsed = planTripSchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError("Invalid body");
        const result = await service.planTrip({
          tripId: req.params.tripId,
          userId: user.id,
          ...parsed.data,
        });
        return ok(reply, result);
      },
    );

    app.get<{
      Params: { tripId: string };
      Querystring: { parentId?: string };
    }>(
      "/:tripId/nodes",
      {
        schema: routeDocs({
          tags: ["Trips"],
          summary: "List trip nodes",
          description: "List child pipeline nodes. Omit parentId for the trip root.",
          params: tripIdParams,
          paramsExample: { tripId: SAMPLE_TRIP_ID },
          querystring: listNodesQuery,
          queryExample: { parentId: SAMPLE_NODE_ID },
        }),
      },
      async (req, reply) => {
        const auth = requireUser(req.user);
        const user = await service.ensureUser(auth.uid, auth.email ?? `${auth.uid}@unknown`);
        const parentId = req.query.parentId;
        const nodes = await service.listChildren(
          req.params.tripId,
          user.id,
          parentId && parentId.length > 0 ? parentId : null,
        );
        return ok(reply, { nodes });
      },
    );

    app.post<{ Params: { tripId: string } }>(
      "/:tripId/nodes",
      {
        schema: routeDocs({
          tags: ["Trips"],
          summary: "Add a trip node",
          description: "Insert a custom pipeline node under a parent checkpoint.",
          params: tripIdParams,
          paramsExample: { tripId: SAMPLE_TRIP_ID },
          body: addNodeSchema,
          bodyExample: {
            parentId: SAMPLE_NODE_ID,
            type: "ACTIVITY",
            title: "Osaka Castle",
            contentType: "poi",
            content: { area: "Chuo-ku" },
            costAmount: 600,
            costCurrency: "JPY",
            durationMinutes: 120,
            deepLinkUrl: "https://maps.google.com/?q=Osaka+Castle",
            provider: "user",
          },
          statusCodes: [201],
        }),
      },
      async (req, reply) => {
        const auth = requireUser(req.user);
        const user = await service.ensureUser(auth.uid, auth.email ?? `${auth.uid}@unknown`);
        const parsed = addNodeSchema.safeParse(req.body);
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
      },
    );
  };
}
