import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AuthService } from "../application/service.js";
import { DevAuthProvider } from "../infra/dev-provider.js";
import { createAuthRoutes } from "./routes.js";
import { buildTestApp, injectJson } from "../../../test/helpers.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("createAuthRoutes", () => {
  it("exposes health and me", async () => {
    const service = new AuthService(new DevAuthProvider());
    const app = await buildTestApp(createAuthRoutes(service), {
      user: { uid: "u", email: "e" },
    });

    const health = await injectJson(app, "GET", "/health");
    assert.equal(health.statusCode, 200);
    assert.equal(health.json().data.provider, "dev");
    assert.equal(health.json().data.module, "auth");

    const me = await injectJson(app, "GET", "/me");
    assert.equal(me.statusCode, 200);
    assert.equal(me.json().data.user.uid, "u");
    assert.equal(me.json().data.provider, "dev");

    const missing = await injectJson(app, "POST", "/test-token", { body: {} });
    assert.equal(missing.statusCode, 404);

    await app.close();

    const unauth = await buildTestApp(createAuthRoutes(service));
    const denied = await injectJson(unauth, "GET", "/me");
    assert.equal(denied.statusCode, 401);
    assert.equal(denied.json().error.code, "UNAUTHORIZED");
    await unauth.close();
  });

  it("issues a public test token when enabled", async () => {
    const service = new AuthService(new DevAuthProvider(), {
      enabled: true,
      webApiKey: "web-key",
      fetchImpl: async () =>
        jsonResponse(200, {
          idToken: "jwt-token",
          refreshToken: "refresh",
          expiresIn: "3600",
          email: "jktsofts@gmail.com",
          localId: "uid-1",
        }),
    });
    const app = await buildTestApp(createAuthRoutes(service));

    const missingCreds = await injectJson(app, "POST", "/test-token", { body: {} });
    assert.equal(missingCreds.statusCode, 400);

    const bad = await injectJson(app, "POST", "/test-token", { body: { email: "nope" } });
    assert.equal(bad.statusCode, 400);

    const ok = await injectJson(app, "POST", "/test-token", {
      body: { email: "jktsofts@gmail.com", password: "secret" },
    });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.json().data.idToken, "jwt-token");
    assert.equal(ok.json().data.tokenType, "Bearer");

    await app.close();
  });
});
