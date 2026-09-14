import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import { buildApp } from "./app.js";
import { ok } from "./reply.js";
import {
  healthDocs,
  mergeOpenApiTransform,
  registerOpenApi,
  routeDocs,
  swaggerTestTokenInterceptor,
  toOpenApiSchema,
} from "./openapi.js";

describe("openapi helpers", () => {
  it("converts zod schemas without $schema", () => {
    const json = toOpenApiSchema(
      z.object({
        city: z.string().min(1),
        adults: z.number().int().positive().optional(),
      }),
    );
    assert.equal(json.$schema, undefined);
    assert.equal(json.type, "object");
    assert.deepEqual(json.required, ["city"]);
  });

  it("builds route docs with and without request parts", () => {
    const health = healthDocs("Auth", "auth");
    assert.deepEqual(health.tags, ["Auth"]);
    assert.deepEqual(health.security, [{ bearerAuth: [] }]);
    assert.ok(health.docs?.response);
    assert.equal(health.docs?.body, undefined);

    const documented = routeDocs({
      tags: ["Flights"],
      summary: "Search",
      description: "Find offers",
      body: z.object({ origin: z.string() }),
      params: z.object({ id: z.string() }),
      querystring: z.object({ city: z.string().optional() }),
      auth: false,
      statusCodes: [200, 201],
    });
    assert.deepEqual(documented.security, []);
    assert.equal(documented.description, "Find offers");
    assert.equal(documented.docs?.body?.type, "object");
    assert.equal(documented.docs?.params?.type, "object");
    assert.equal(documented.docs?.querystring?.type, "object");
    assert.ok(documented.docs?.response?.["201"]);

    const withExample = routeDocs({
      tags: ["Auth"],
      summary: "Test token",
      body: z.object({ email: z.string().optional(), password: z.string().optional() }),
      bodyExample: { email: "user@example.com", password: "secret", unused: true },
      auth: false,
    });
    assert.deepEqual(withExample.docs?.body?.example, {
      email: "user@example.com",
      password: "secret",
      unused: true,
    });
    const idSchema = (withExample.docs?.body?.properties as { email?: { example?: string } } | undefined)?.email;
    assert.equal(idSchema?.example, "user@example.com");

    const withParams = routeDocs({
      tags: ["Trips"],
      summary: "Get trip",
      params: z.object({ tripId: z.string() }),
      paramsExample: { tripId: "11111111-1111-4111-8111-111111111111" },
      querystring: z.object({ parentId: z.string().optional() }),
      queryExample: { parentId: "22222222-2222-4222-8222-222222222222" },
    });
    assert.equal(
      (withParams.docs?.params?.properties as { tripId?: { example?: string } } | undefined)?.tripId?.example,
      "11111111-1111-4111-8111-111111111111",
    );
    assert.equal(
      (withParams.docs?.querystring?.properties as { parentId?: { example?: string } } | undefined)?.parentId?.example,
      "22222222-2222-4222-8222-222222222222",
    );
  });

  it("merges docs into the OpenAPI schema and leaves others alone", () => {
    const passthrough = mergeOpenApiTransform({
      schema: { summary: "plain" },
      url: "/plain",
    });
    assert.equal(passthrough.schema.summary, "plain");
    assert.equal(passthrough.url, "/plain");

    const merged = mergeOpenApiTransform({
      schema: {
        summary: "search",
        docs: { body: { type: "object" } },
      },
      url: "/search",
    });
    assert.equal(merged.schema.summary, "search");
    assert.equal((merged.schema as { body?: { type: string } }).body?.type, "object");
    assert.equal((merged.schema as { docs?: unknown }).docs, undefined);
  });
});

describe("registerOpenApi", () => {
  it("serves Swagger UI and OpenAPI JSON", async () => {
    const app = buildApp();
    await registerOpenApi(app);
    app.get(
      "/ping",
      {
        schema: routeDocs({
          tags: ["Health"],
          summary: "Ping",
          auth: false,
        }),
      },
      async (_req, reply) => ok(reply, { pong: true }),
    );
    await app.ready();

    const ui = await app.inject({ method: "GET", url: "/docs" });
    assert.equal(ui.statusCode, 200);
    assert.match(ui.headers["content-type"] ?? "", /text\/html/);

    const spec = await app.inject({ method: "GET", url: "/docs/json" });
    assert.equal(spec.statusCode, 200);
    const json = spec.json() as {
      info: { title: string };
      paths: Record<string, unknown>;
    };
    assert.equal(json.info.title, "Traverior API");
    assert.ok(json.paths["/ping"]);

    const initializer = await app.inject({
      method: "GET",
      url: "/docs/static/swagger-initializer.js",
    });
    assert.equal(initializer.statusCode, 200);
    assert.match(initializer.body, /preauthorizeApiKey/);
    assert.match(initializer.body, /\/v1\/auth\/test-token/);

    await app.close();
  });

  it("protects Swagger UI with HTTP Basic Auth", async () => {
    const app = buildApp();
    await registerOpenApi(app, { basicAuth: { username: "docs", password: "secret" } });
    await app.ready();

    const denied = await app.inject({ method: "GET", url: "/docs" });
    assert.equal(denied.statusCode, 401);
    assert.match(String(denied.headers["www-authenticate"] ?? ""), /Basic realm=/);

    const specDenied = await app.inject({ method: "GET", url: "/docs/json" });
    assert.equal(specDenied.statusCode, 401);

    const allowed = await app.inject({
      method: "GET",
      url: "/docs",
      headers: { authorization: "Basic " + Buffer.from("docs:secret").toString("base64") },
    });
    assert.equal(allowed.statusCode, 200);
    assert.match(allowed.headers["content-type"] ?? "", /text\/html/);

    const spec = await app.inject({
      method: "GET",
      url: "/docs/json",
      headers: { authorization: "Basic " + Buffer.from("docs:secret").toString("base64") },
    });
    assert.equal(spec.statusCode, 200);
    assert.equal((spec.json() as { info: { title: string } }).info.title, "Traverior API");

    await app.close();
  });
});

describe("swaggerTestTokenInterceptor", () => {
  it("authorizes bearerAuth from a successful test-token response", () => {
    const calls: string[] = [];
    (globalThis as { ui?: { preauthorizeApiKey: (name: string, value: string) => void } }).ui = {
      preauthorizeApiKey(name, value) {
        calls.push(`${name}:${value}`);
      },
    };

    const viaBody = swaggerTestTokenInterceptor({
      url: "http://localhost:3000/v1/auth/test-token",
      status: 200,
      body: { ok: true, data: { idToken: "jwt-from-body" } },
    });
    assert.equal(viaBody.status, 200);
    assert.deepEqual(calls, ["bearerAuth:jwt-from-body"]);

    swaggerTestTokenInterceptor({
      url: "/v1/auth/test-token?x=1",
      status: 200,
      body: '{"ok":true,"data":{"idToken":"jwt-from-string"}}',
    });
    swaggerTestTokenInterceptor({
      url: "http://localhost/v1/auth/test-token",
      status: 200,
      obj: { data: { idToken: "jwt-from-obj" } },
    });
    swaggerTestTokenInterceptor({
      url: "http://localhost/v1/auth/test-token",
      status: 200,
      text: '{"data":{"idToken":"jwt-from-text"}}',
    });
    assert.deepEqual(calls, [
      "bearerAuth:jwt-from-body",
      "bearerAuth:jwt-from-string",
      "bearerAuth:jwt-from-obj",
      "bearerAuth:jwt-from-text",
    ]);

    delete (globalThis as { ui?: unknown }).ui;
  });

  it("ignores other responses and bad payloads", () => {
    const calls: string[] = [];
    (globalThis as { ui?: { preauthorizeApiKey: (name: string, value: string) => void } }).ui = {
      preauthorizeApiKey(name, value) {
        calls.push(`${name}:${value}`);
      },
    };

    swaggerTestTokenInterceptor({ url: "/v1/auth/me", status: 200, body: { data: { idToken: "nope" } } });
    swaggerTestTokenInterceptor({ url: "/v1/auth/test-token", status: 401, body: { data: { idToken: "nope" } } });
    swaggerTestTokenInterceptor({ url: "/v1/auth/test-token", status: 200, body: { data: {} } });
    swaggerTestTokenInterceptor({ url: "/v1/auth/test-token", status: 200, body: { ok: true } });
    swaggerTestTokenInterceptor({ url: "/v1/auth/test-token", status: 200, body: "not-json" });
    swaggerTestTokenInterceptor({ url: "/v1/auth/test-token", status: 200, data: 12 });
    delete (globalThis as { ui?: unknown }).ui;
    swaggerTestTokenInterceptor({
      url: "/v1/auth/test-token",
      status: 200,
      body: { data: { idToken: "no-ui" } },
    });
    (globalThis as { ui?: { preauthorizeApiKey?: unknown } }).ui = { preauthorizeApiKey: true };
    swaggerTestTokenInterceptor({
      url: "/v1/auth/test-token",
      status: 200,
      body: { data: { idToken: "not-a-function" } },
    });
    delete (globalThis as { ui?: unknown }).ui;
    swaggerTestTokenInterceptor({
      url: "/v1/auth/test-token",
      status: 200,
      body: { data: { idToken: "after-delete" } },
    });
    assert.deepEqual(calls, []);
  });
});
