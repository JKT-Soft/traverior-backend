import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireUser } from "../../auth/require-user.js";
import { ValidationError } from "../../../shared/http/errors.js";
import { routeDocs } from "../../../shared/http/openapi.js";
import { SAMPLE_TRIP_ID } from "../../../shared/http/openapi-examples.js";
import { ok } from "../../../shared/http/reply.js";
import type { DisruptionMonitorService } from "../application/service.js";

const uuid = z.string().uuid();

const tripIdParamsSchema = z.object({
  tripId: uuid,
});

const alertIdParamsSchema = z.object({
  tripId: uuid,
  alertId: uuid,
});

const listAlertsQuerySchema = z.object({
  unreadOnly: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((val) => {
      if (typeof val === "boolean") return val;
      if (typeof val === "string") return val === "true" || val === "1";
      return undefined;
    }),
  kind: z.string().optional(),
  limit: z
    .union([z.number(), z.string()])
    .optional()
    .transform((val) => {
      if (typeof val === "number") return val;
      if (typeof val === "string") return Number.parseInt(val, 10);
      return undefined;
    }),
});

export function createDisruptionRoutes(
  service: DisruptionMonitorService,
): FastifyPluginAsync {
  return async (app) => {
    // 1. List alerts for a trip
    app.get(
      "/:tripId/alerts",
      {
        schema: routeDocs({
          tags: ["Disruptions"],
          summary: "List trip alerts",
          description:
            "Returns disruption alerts (delays, severe weather, cancellations) for the specified trip.",
          auth: true,
          params: tripIdParamsSchema,
          querystring: listAlertsQuerySchema,
          paramsExample: { tripId: SAMPLE_TRIP_ID },
        }),
      },
      async (req, reply) => {
        requireUser(req.user);
        const paramsParsed = tripIdParamsSchema.safeParse(req.params);
        if (!paramsParsed.success) {
          throw new ValidationError("Invalid tripId");
        }

        const queryParsed = listAlertsQuerySchema.safeParse(req.query);
        const filter = queryParsed.success ? queryParsed.data : {};

        const alerts = await service.listAlerts(paramsParsed.data.tripId, filter);
        return ok(reply, alerts);
      },
    );

    // 2. Trigger disruption check for a trip
    app.post(
      "/:tripId/alerts/check",
      {
        schema: routeDocs({
          tags: ["Disruptions"],
          summary: "Check disruptions for trip",
          description:
            "Scans the trip for delays, severe weather warnings, and cancellations. Deduplicates against alerts created in the last 24 hours.",
          auth: true,
          params: tripIdParamsSchema,
          paramsExample: { tripId: SAMPLE_TRIP_ID },
        }),
      },
      async (req, reply) => {
        requireUser(req.user);
        const paramsParsed = tripIdParamsSchema.safeParse(req.params);
        if (!paramsParsed.success) {
          throw new ValidationError("Invalid tripId");
        }

        const result = await service.checkTrip(paramsParsed.data.tripId);
        return ok(reply, result);
      },
    );

    // 3. Mark a specific alert as read
    app.patch(
      "/:tripId/alerts/:alertId/read",
      {
        schema: routeDocs({
          tags: ["Disruptions"],
          summary: "Mark trip alert as read",
          description: "Marks a specific disruption alert as read.",
          auth: true,
          params: alertIdParamsSchema,
          paramsExample: {
            tripId: SAMPLE_TRIP_ID,
            alertId: "55555555-5555-5555-5555-555555555555",
          },
        }),
      },
      async (req, reply) => {
        requireUser(req.user);
        const paramsParsed = alertIdParamsSchema.safeParse(req.params);
        if (!paramsParsed.success) {
          throw new ValidationError("Invalid parameters");
        }

        const alert = await service.markAlertRead(
          paramsParsed.data.tripId,
          paramsParsed.data.alertId,
        );
        return ok(reply, alert);
      },
    );

    // 4. Mark all alerts for a trip as read
    app.post(
      "/:tripId/alerts/read-all",
      {
        schema: routeDocs({
          tags: ["Disruptions"],
          summary: "Mark all alerts as read",
          description: "Marks all unread disruption alerts for the trip as read.",
          auth: true,
          params: tripIdParamsSchema,
          paramsExample: { tripId: SAMPLE_TRIP_ID },
        }),
      },
      async (req, reply) => {
        requireUser(req.user);
        const paramsParsed = tripIdParamsSchema.safeParse(req.params);
        if (!paramsParsed.success) {
          throw new ValidationError("Invalid tripId");
        }

        const result = await service.markAllAlertsRead(paramsParsed.data.tripId);
        return ok(reply, result);
      },
    );

    // 5. Trigger monitor check across all active trips
    app.post(
      "/monitor/run",
      {
        schema: routeDocs({
          tags: ["Disruptions"],
          summary: "Trigger disruption scan across all active trips",
          description:
            "Scans all active and planning trips for disruptions and logs results.",
          auth: true,
        }),
      },
      async (req, reply) => {
        requireUser(req.user);
        const results = await service.checkAllActiveTrips();
        return ok(reply, results);
      },
    );
  };
}
