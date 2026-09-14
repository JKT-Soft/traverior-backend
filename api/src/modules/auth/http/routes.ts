import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ValidationError } from "../../../shared/http/errors.js";
import { healthDocs, routeDocs } from "../../../shared/http/openapi.js";
import { ok } from "../../../shared/http/reply.js";
import type { AuthService } from "../application/service.js";

const testTokenSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(1).optional(),
});

const testTokenBodyExample = {
  email: "jktsofts@gmail.com",
  password: "Otnasus180800",
};

export function createAuthRoutes(service: AuthService): FastifyPluginAsync {
  return async (app) => {
    app.get("/health", { schema: healthDocs("Auth", "auth") }, async (_req, reply) => {
      return ok(reply, { module: "auth", provider: service.providerName });
    });

    app.get(
      "/me",
      {
        schema: routeDocs({
          tags: ["Auth"],
          summary: "Current user",
          description: "Returns the authenticated user from the Bearer token.",
        }),
      },
      async (req, reply) => {
        const user = service.requireUser(req.user);
        return ok(reply, { user, provider: service.providerName });
      },
    );

    if (!service.testLoginEnabled) return;

    app.post(
      "/test-token",
      {
        schema: routeDocs({
          tags: ["Auth"],
          summary: "Get a test Bearer token",
          description:
            "Development only. Signs in via Firebase email/password and returns an ID token. Swagger Authorize is filled automatically from data.idToken. Omit the body to use FIREBASE_TEST_EMAIL / FIREBASE_TEST_PASSWORD.",
          body: testTokenSchema,
          bodyExample: testTokenBodyExample,
          auth: false,
        }),
      },
      async (req, reply) => {
        const parsed = testTokenSchema.safeParse(req.body ?? {});
        if (!parsed.success) throw new ValidationError("Invalid body");
        return ok(reply, await service.issueTestToken(parsed.data));
      },
    );
  };
}
