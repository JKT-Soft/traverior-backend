import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireUser } from "../../auth/require-user.js";
import { ValidationError } from "../../../shared/http/errors.js";
import { ok } from "../../../shared/http/reply.js";
import type { ProfileService } from "../application/service.js";

const preferencesSchema = z
  .object({
    budgetMax: z.number().nonnegative().nullable().optional(),
    budgetStyle: z.enum(["budget", "balanced", "luxury"]).optional(),
    pace: z.enum(["relaxed", "moderate", "packed"]).optional(),
    dietary: z.array(z.string()).optional(),
    interests: z.array(z.string()).optional(),
    travelWith: z.enum(["solo", "couple", "family", "friends"]).nullable().optional(),
    avoid: z.array(z.string()).optional(),
    extra: z.record(z.unknown()).nullable().optional(),
  })
  .optional();

const updateProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120).nullable().optional(),
    photoUrl: z.string().url().nullable().optional(),
    locale: z.string().trim().min(2).max(10).optional(),
    homeCurrency: z.string().trim().length(3).optional(),
    preferences: preferencesSchema,
  })
  .refine(
    (body) =>
      body.displayName !== undefined ||
      body.photoUrl !== undefined ||
      body.locale !== undefined ||
      body.homeCurrency !== undefined ||
      body.preferences !== undefined,
    { message: "At least one field is required" },
  );

export function createProfileRoutes(service: ProfileService): FastifyPluginAsync {
  return async (app) => {
    app.get("/health", async (_req, reply) => {
      return ok(reply, { module: "profile" });
    });

    app.get("/", async (req, reply) => {
      const auth = requireUser(req.user);
      const user = await service.ensureUser(auth.uid, auth.email ?? `${auth.uid}@unknown`);
      const profile = await service.getProfile(user.id);
      return ok(reply, { profile });
    });

    app.patch("/", async (req, reply) => {
      const auth = requireUser(req.user);
      const user = await service.ensureUser(auth.uid, auth.email ?? `${auth.uid}@unknown`);
      const parsed = updateProfileSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError("Invalid body");
      const profile = await service.updateProfile(user.id, parsed.data);
      return ok(reply, { profile });
    });
  };
}
