import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AuthService } from "../application/service.js";
import { DevAuthProvider } from "../infra/dev-provider.js";
import { createAuthRoutes } from "./routes.js";
import { buildTestApp, injectJson } from "../../../test/helpers.js";

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

    await app.close();

    const unauth = await buildTestApp(createAuthRoutes(service));
    const denied = await injectJson(unauth, "GET", "/me");
    assert.equal(denied.statusCode, 401);
    assert.equal(denied.json().error.code, "UNAUTHORIZED");
    await unauth.close();
  });
});
