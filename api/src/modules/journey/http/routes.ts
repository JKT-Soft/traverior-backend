import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireUser } from "../../auth/require-user.js";
import { ValidationError } from "../../../shared/http/errors.js";
import { routeDocs } from "../../../shared/http/openapi.js";
import {
  SAMPLE_CHECKLIST_ID,
  SAMPLE_CHECKLIST_ITEM_ID,
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

const planningMessageSchema = z.object({
  text: z.string().min(1),
  stopId: z.string().min(1).optional(),
  answers: z.record(z.unknown()).optional(),
});

const listNodesQuery = z.object({
  parentId: z.string().optional(),
});

const checklistItemParams = z.object({
  tripId: z.string().uuid(),
  checklistId: z.string().uuid(),
  itemId: z.string().min(1),
});

const updateChecklistItemSchema = z.object({
  done: z.boolean(),
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
          description:
            "Load a journey in the stops + catalog plan shape (same schema as POST /plan).",
          params: tripIdParams,
          paramsExample: { tripId: SAMPLE_TRIP_ID },
        }),
      },
      async (req, reply) => {
        const auth = requireUser(req.user);
        const user = await service.ensureUser(auth.uid, auth.email ?? `${auth.uid}@unknown`);
        const plan = await service.getTripPlan(req.params.tripId, user.id);
        return ok(reply, plan);
      },
    );

    app.post<{ Params: { tripId: string } }>(
      "/:tripId/plan",
      {
        schema: routeDocs({
          tags: ["Trips"],
          summary: "Plan a trip",
          description:
            "Run the planner, persist stops and catalog rows, and return the stops + catalog plan response.",
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

    app.get<{ Params: { tripId: string } }>(
      "/:tripId/planning",
      {
        schema: routeDocs({
          tags: ["Trips"],
          summary: "Get planning chat",
          description:
            "Load the planning chat transcript and live skeleton draft. No provider APIs are called.",
          params: tripIdParams,
          paramsExample: { tripId: SAMPLE_TRIP_ID },
        }),
      },
      async (req, reply) => {
        const auth = requireUser(req.user);
        const user = await service.ensureUser(auth.uid, auth.email ?? `${auth.uid}@unknown`);
        const planning = await service.getPlanningChat(req.params.tripId, user.id);
        return ok(reply, planning);
      },
    );

    app.post<{ Params: { tripId: string } }>(
      "/:tripId/planning/messages",
      {
        schema: routeDocs({
          tags: ["Trips"],
          summary: "Send a planning chat message",
          description:
            "Append a user message, revise the live draft with the LLM only, and return the full chat state. Provider search is not run.",
          params: tripIdParams,
          paramsExample: { tripId: SAMPLE_TRIP_ID },
          body: planningMessageSchema,
          bodyExample: {
            text: "7 hari Jepang, nuansa budaya, dari Jakarta, 1–7 November.",
            stopId: "stay_tokyo",
          },
        }),
      },
      async (req, reply) => {
        const auth = requireUser(req.user);
        const user = await service.ensureUser(auth.uid, auth.email ?? `${auth.uid}@unknown`);
        const parsed = planningMessageSchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError("Invalid body");
        const planning = await service.postPlanningMessage({
          tripId: req.params.tripId,
          userId: user.id,
          ...parsed.data,
        });
        return ok(reply, planning);
      },
    );

    app.post<{ Params: { tripId: string } }>(
      "/:tripId/planning/search",
      {
        schema: routeDocs({
          tags: ["Trips"],
          summary: "Search from locked planning draft",
          description:
            "Run provider search from the current planning draft (Mulai pencarian). Persists stops and catalog rows.",
          params: tripIdParams,
          paramsExample: { tripId: SAMPLE_TRIP_ID },
          body: z.object({ context: toolContextSchema }).optional(),
          bodyExample: { context: SAMPLE_TOOL_CONTEXT },
        }),
      },
      async (req, reply) => {
        const auth = requireUser(req.user);
        const user = await service.ensureUser(auth.uid, auth.email ?? `${auth.uid}@unknown`);
        const context =
          req.body && typeof req.body === "object" && "context" in req.body
            ? (req.body as { context?: z.infer<typeof toolContextSchema> }).context
            : undefined;
        const result = await service.searchPlanningDraft({
          tripId: req.params.tripId,
          userId: user.id,
          context,
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
          description: "List child stops. Omit parentId for top-level journey stops.",
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
          description: "Insert a custom stop under a parent stop or the journey.",
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

    app.patch<{
      Params: { tripId: string; checklistId: string; itemId: string };
    }>(
      "/:tripId/checklists/:checklistId/items/:itemId",
      {
        schema: routeDocs({
          tags: ["Trips"],
          summary: "Update checklist item",
          description:
            "Toggle done on one checklist item inside catalog_checklists.items JSON for the trip.",
          params: checklistItemParams,
          paramsExample: {
            tripId: SAMPLE_TRIP_ID,
            checklistId: SAMPLE_CHECKLIST_ID,
            itemId: SAMPLE_CHECKLIST_ITEM_ID,
          },
          body: updateChecklistItemSchema,
          bodyExample: { done: true },
        }),
      },
      async (req, reply) => {
        const auth = requireUser(req.user);
        const user = await service.ensureUser(auth.uid, auth.email ?? `${auth.uid}@unknown`);
        const params = checklistItemParams.safeParse(req.params);
        if (!params.success) throw new ValidationError("Invalid params");
        const body = updateChecklistItemSchema.safeParse(req.body);
        if (!body.success) throw new ValidationError("Invalid body");
        const checklist = await service.updateChecklistItem({
          tripId: params.data.tripId,
          userId: user.id,
          checklistId: params.data.checklistId,
          itemId: params.data.itemId,
          done: body.data.done,
        });
        return ok(reply, { checklist });
      },
    );
  };
}
