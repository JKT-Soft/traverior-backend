import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  credentialsMatch,
  createSwaggerBasicAuthHook,
  parseBasicAuthHeader,
  swaggerBasicAuthHeader,
  SWAGGER_BASIC_REALM,
} from "./swagger-basic-auth.js";
import { buildApp } from "./app.js";

describe("swagger basic auth", () => {
  it("parses Basic headers and rejects malformed values", () => {
    const header = swaggerBasicAuthHeader("traverior", "p:ass:word");
    assert.deepEqual(parseBasicAuthHeader(header), {
      username: "traverior",
      password: "p:ass:word",
    });
    assert.deepEqual(parseBasicAuthHeader(["Basic dXNlcjpwYXNz"]), { username: "user", password: "pass" });
    assert.equal(parseBasicAuthHeader(undefined), null);
    assert.equal(parseBasicAuthHeader("Bearer abc"), null);
    assert.equal(parseBasicAuthHeader("Basic"), null);
    assert.equal(parseBasicAuthHeader("Basic not-base64-$$$"), null);
    assert.equal(parseBasicAuthHeader(`Basic ${Buffer.from("nocolon").toString("base64")}`), null);
  });

  it("compares credentials without leaking length", () => {
    assert.equal(
      credentialsMatch({ username: "a", password: "b" }, { username: "a", password: "b" }),
      true,
    );
    assert.equal(
      credentialsMatch({ username: "a", password: "nope" }, { username: "a", password: "b" }),
      false,
    );
  });

  it("hooks send WWW-Authenticate on failure", async () => {
    const app = buildApp();
    app.addHook("onRequest", createSwaggerBasicAuthHook({ username: "docs", password: "secret" }));
    app.get("/docs", async () => ({ ok: true }));
    await app.ready();

    const denied = await app.inject({ method: "GET", url: "/docs" });
    assert.equal(denied.statusCode, 401);
    assert.equal(denied.headers["www-authenticate"], SWAGGER_BASIC_REALM);
    assert.equal(denied.json().error.code, "UNAUTHORIZED");

    const wrong = await app.inject({
      method: "GET",
      url: "/docs",
      headers: { authorization: swaggerBasicAuthHeader("docs", "wrong") },
    });
    assert.equal(wrong.statusCode, 401);

    const allowed = await app.inject({
      method: "GET",
      url: "/docs",
      headers: { authorization: swaggerBasicAuthHeader("docs", "secret") },
    });
    assert.equal(allowed.statusCode, 200);

    await app.close();
  });
});
