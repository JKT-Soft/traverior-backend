import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadEnv } from "../../config/env.js";
import { baseEnv, buildTestApp, injectJson, mockReq } from "../../test/helpers.js";
import { createAuthModule, createAuthProvider, AuthService, requireUser } from "./index.js";
import { DevAuthProvider } from "./infra/dev-provider.js";

describe("createAuthProvider", () => {
  it("default arm throws on unknown mode", () => {
    assert.throws(
      () => createAuthProvider({ authMode: "ldap" } as never),
      /Unknown AUTH_MODE/,
    );
  });
});

describe("barrel re-exports", () => {
  it("exposes AuthService and requireUser", () => {
    assert.equal(new AuthService(new DevAuthProvider()).providerName, "dev");
    assert.equal(requireUser({ uid: "1" }).uid, "1");
  });
});

describe("createAuthModule", () => {
  it("wires routes and resolver", async () => {
    const env = loadEnv(baseEnv());
    const mod = createAuthModule(env);
    assert.equal(mod.service.providerName, "dev");

    const app = await buildTestApp(mod.routes, { user: { uid: "u", email: "e" } });
    const health = await injectJson(app, "GET", "/health");
    assert.equal(health.json().data.provider, "dev");

    const me = await injectJson(app, "GET", "/me");
    assert.equal(me.json().data.user.uid, "u");
    await app.close();

    const unauth = await buildTestApp(mod.routes);
    const denied = await injectJson(unauth, "GET", "/me");
    assert.equal(denied.statusCode, 401);
    await unauth.close();

    const resolved = await mod.resolveAuth(
      mockReq({ headers: { authorization: "Bearer dev:abc" } }),
    );
    assert.equal(resolved?.uid, "abc");
  });

  it("firebase mode", () => {
    const env = loadEnv(baseEnv({ AUTH_MODE: "firebase", FIREBASE_PROJECT_ID: "x" }));
    const mod = createAuthModule(env);
    assert.equal(mod.service.providerName, "firebase");
  });
});
