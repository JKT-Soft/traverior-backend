import type { FastifyPluginAsync } from "fastify";
import { ok } from "../../../shared/http/reply.js";
import type { AuthService } from "../application/service.js";

export function createAuthRoutes(service: AuthService): FastifyPluginAsync {
  return async (app) => {
    app.get("/health", async (_req, reply) => {
      return ok(reply, { module: "auth", provider: service.providerName });
    });

    app.get("/me", async (req, reply) => {
      const user = service.requireUser(req.user);
      return ok(reply, { user, provider: service.providerName });
    });
  };
}
