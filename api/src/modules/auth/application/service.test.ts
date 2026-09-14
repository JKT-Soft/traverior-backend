import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError, NotFoundError, UnauthorizedError, ValidationError } from "../../../shared/http/errors.js";
import { mockReq } from "../../../test/helpers.js";
import { DevAuthProvider } from "../infra/dev-provider.js";
import { AuthService } from "./service.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("AuthService", () => {
  it("wraps provider", async () => {
    const service = new AuthService(new DevAuthProvider());
    assert.equal(service.providerName, "dev");
    assert.equal(service.testLoginEnabled, false);
    assert.equal(service.requireUser({ uid: "x" }).uid, "x");
    assert.throws(() => service.requireUser(undefined), UnauthorizedError);
    const user = await service.resolve(mockReq({ headers: { authorization: "Bearer dev:z" } }));
    assert.equal(user?.uid, "z");
  });

  it("issues a test token from Firebase", async () => {
    const service = new AuthService(new DevAuthProvider(), {
      enabled: true,
      webApiKey: "web-key",
      email: "default@t.co",
      password: "default-pass",
      fetchImpl: async () =>
        jsonResponse(200, {
          idToken: "id-token",
          refreshToken: "refresh",
          expiresIn: "3600",
          email: "user@t.co",
          localId: "uid",
        }),
    });
    const fromBody = await service.issueTestToken({ email: "user@t.co", password: "secret" });
    assert.equal(fromBody.idToken, "id-token");

    const fromEnv = await service.issueTestToken({});
    assert.equal(fromEnv.tokenType, "Bearer");
  });

  it("rejects test-token when disabled, unconfigured, or missing credentials", async () => {
    const disabled = new AuthService(new DevAuthProvider());
    await assert.rejects(() => disabled.issueTestToken(), NotFoundError);

    const noKey = new AuthService(new DevAuthProvider(), { enabled: true });
    await assert.rejects(
      () => noKey.issueTestToken({ email: "a@b.c", password: "x" }),
      (err: unknown) => err instanceof AppError && err.code === "AUTH_TEST_LOGIN_UNAVAILABLE",
    );

    const noCreds = new AuthService(new DevAuthProvider(), { enabled: true, webApiKey: "k" });
    await assert.rejects(() => noCreds.issueTestToken({}), ValidationError);
  });
});
