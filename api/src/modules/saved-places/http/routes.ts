import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireUser } from "../../auth/require-user.js";
import { ValidationError } from "../../../shared/http/errors.js";
import { ok } from "../../../shared/http/reply.js";
import { SAVED_PLACE_SOURCES, type SavedPlaceService } from "../application/service.js";

const uuid = z.string().uuid();

const savePlaceSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    address: z.string().trim().max(400).nullable().optional(),
    city: z.string().trim().max(120).nullable().optional(),
    country: z.string().trim().max(120).nullable().optional(),
    lat: z.number().gte(-90).lte(90).nullable().optional(),
    lng: z.number().gte(-180).lte(180).nullable().optional(),
    source: z.enum(SAVED_PLACE_SOURCES).optional(),
    provider: z.string().trim().max(80).nullable().optional(),
    providerRef: z.string().trim().max(200).nullable().optional(),
    tripId: uuid.nullable().optional(),
    nodeId: uuid.nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    extra: z.record(z.unknown()).nullable().optional(),
  })
  .refine((body) => Boolean(body.name?.trim()) || Boolean(body.nodeId), {
    message: "Name or nodeId is required",
  });

const updatePlaceSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    address: z.string().trim().max(400).nullable().optional(),
    city: z.string().trim().max(120).nullable().optional(),
    country: z.string().trim().max(120).nullable().optional(),
    lat: z.number().gte(-90).lte(90).nullable().optional(),
    lng: z.number().gte(-180).lte(180).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    extra: z.record(z.unknown()).nullable().optional(),
  })
  .refine(
    (body) =>
      body.name !== undefined ||
      body.address !== undefined ||
      body.city !== undefined ||
      body.country !== undefined ||
      body.lat !== undefined ||
      body.lng !== undefined ||
      body.notes !== undefined ||
      body.extra !== undefined,
    { message: "At least one field is required" },
  );

const listQuerySchema = z.object({
  city: z.string().trim().min(1).optional(),
  nodeId: uuid.optional(),
  providerRef: z.string().trim().min(1).optional(),
});

const idParamsSchema = z.object({ id: uuid });

export function createSavedPlaceRoutes(service: SavedPlaceService): FastifyPluginAsync {
  return async (app) => {
    app.get("/health", async (_req, reply) => {
      return ok(reply, { module: "saved-places" });
    });

    app.get("/", async (req, reply) => {
      const auth = requireUser(req.user);
      const user = await service.ensureUser(auth.uid, auth.email ?? `${auth.uid}@unknown`);
      const parsed = listQuerySchema.safeParse(req.query);
      if (!parsed.success) throw new ValidationError("Invalid query");
      const places = await service.listPlaces(user.id, parsed.data);
      return ok(reply, { places });
    });

    app.post("/", async (req, reply) => {
      const auth = requireUser(req.user);
      const user = await service.ensureUser(auth.uid, auth.email ?? `${auth.uid}@unknown`);
      const parsed = savePlaceSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError("Invalid body");
      const result = await service.savePlace(user.id, parsed.data);
      return ok(reply, result, result.created ? 201 : 200);
    });

    app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
      const auth = requireUser(req.user);
      const user = await service.ensureUser(auth.uid, auth.email ?? `${auth.uid}@unknown`);
      const parsed = idParamsSchema.safeParse(req.params);
      if (!parsed.success) throw new ValidationError("Invalid id");
      const place = await service.getPlace(user.id, parsed.data.id);
      return ok(reply, { place });
    });

    app.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
      const auth = requireUser(req.user);
      const user = await service.ensureUser(auth.uid, auth.email ?? `${auth.uid}@unknown`);
      const params = idParamsSchema.safeParse(req.params);
      if (!params.success) throw new ValidationError("Invalid id");
      const parsed = updatePlaceSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError("Invalid body");
      const place = await service.updatePlace(user.id, params.data.id, parsed.data);
      return ok(reply, { place });
    });

    app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
      const auth = requireUser(req.user);
      const user = await service.ensureUser(auth.uid, auth.email ?? `${auth.uid}@unknown`);
      const parsed = idParamsSchema.safeParse(req.params);
      if (!parsed.success) throw new ValidationError("Invalid id");
      const result = await service.deletePlace(user.id, parsed.data.id);
      return ok(reply, result);
    });
  };
}
