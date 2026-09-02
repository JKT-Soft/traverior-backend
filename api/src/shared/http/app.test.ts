import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PlanNeedsInputError, ValidationError } from "./errors.js";
import { buildApp } from "./app.js";
import { ok } from "./reply.js";

describe("buildApp", () => {
  it("handles success, 404, AppError, and unexpected errors", async () => {
    const app = buildApp({
      auth: async () => ({ uid: "u1", email: "a@b.c" }),
    });

    app.get("/ok", async (req, reply) => {
      return ok(reply, { user: req.user });
    });
    app.get("/boom", async () => {
      throw new ValidationError("nope");
    });
    app.get("/needs-input", async () => {
      throw new PlanNeedsInputError([
        {
          id: "dates",
          field: "startDate",
          severity: "required",
          question: "When do you want to go?",
          input: "date_range",
          options: ["flexible"],
        },
      ]);
    });
    app.get("/crash", async () => {
      throw new Error("unexpected");
    });
    app.get("/statusy", async () => {
      const err = new Error("teapot") as Error & { statusCode: number };
      err.statusCode = 418;
      throw err;
    });
    app.get("/empty-msg", async () => {
      const err = Object.assign(new Error(""), { statusCode: 400 });
      throw err;
    });
    app.post("/echo", async (req, reply) => {
      return ok(reply, req.body);
    });

    await app.ready();

    const okRes = await app.inject({ method: "GET", url: "/ok" });
    assert.equal(okRes.statusCode, 200);
    assert.deepEqual(okRes.json().data, { user: { uid: "u1", email: "a@b.c" } });

    const miss = await app.inject({ method: "GET", url: "/missing" });
    assert.equal(miss.statusCode, 404);
    assert.equal(miss.json().error.code, "NOT_FOUND");

    const boom = await app.inject({ method: "GET", url: "/boom" });
    assert.equal(boom.statusCode, 400);
    assert.equal(boom.json().error.code, "VALIDATION_ERROR");

    const needs = await app.inject({ method: "GET", url: "/needs-input" });
    assert.equal(needs.statusCode, 409);
    assert.equal(needs.json().error.code, "PLAN_NEEDS_INPUT");
    assert.equal(needs.json().error.clarifications[0].id, "dates");

    const crash = await app.inject({ method: "GET", url: "/crash" });
    assert.equal(crash.statusCode, 500);
    assert.equal(crash.json().error.code, "INTERNAL_ERROR");

    const statusy = await app.inject({ method: "GET", url: "/statusy" });
    assert.equal(statusy.statusCode, 500);

    const emptyRes = await app.inject({ method: "GET", url: "/empty-msg" });
    assert.equal(emptyRes.statusCode, 400);
    assert.equal(emptyRes.json().error.message, "Invalid JSON body");

    const badJson = await app.inject({
      method: "POST",
      url: "/echo",
      headers: { "content-type": "application/json" },
      payload: "{",
    });
    assert.equal(badJson.statusCode, 400);
    assert.equal(badJson.json().error.code, "INVALID_JSON");

    await app.close();
  });

  it("works without auth and accepts logger option", async () => {
    const app = buildApp({ logger: true });
    app.get("/x", async (req, reply) => {
      return ok(reply, { user: req.user ?? null });
    });
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/x" });
    assert.equal(res.json().data.user, null);
    await app.close();
  });

  it("requireAuth keeps GET /health public and rejects other routes", async () => {
    const app = buildApp({
      requireAuth: true,
      auth: async (req) => {
        const header = req.headers.authorization;
        if (header === "Bearer ok") return { uid: "u1" };
        return undefined;
      },
    });
    app.get("/health", async (_req, reply) => ok(reply, { ok: true }));
    app.get("/secret", async (_req, reply) => ok(reply, { secret: true }));
    await app.ready();

    const health = await app.inject({ method: "GET", url: "/health" });
    assert.equal(health.statusCode, 200);

    const denied = await app.inject({ method: "GET", url: "/secret" });
    assert.equal(denied.statusCode, 401);

    const allowed = await app.inject({
      method: "GET",
      url: "/secret",
      headers: { authorization: "Bearer ok" },
    });
    assert.equal(allowed.statusCode, 200);
    await app.close();
  });

  it("exposes error message in 500 when exposeErrorDetails is on", async () => {
    const app = buildApp({ exposeErrorDetails: true });
    app.get("/crash", async () => {
      throw new Error("Eventbrite discovery failed (403)");
    });
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/crash" });
    assert.equal(res.statusCode, 500);
    assert.equal(res.json().error.message, "Eventbrite discovery failed (403)");
    await app.close();
  });

  it("accepts pino loggerInstance from createFileLogger", async () => {
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { createFileLogger } = await import("../logging/logger.js");
    const dir = mkdtempSync(join(tmpdir(), "traverior-app-logs-"));
    try {
      const app = buildApp({
        logger: createFileLogger({ dir, console: false }),
      });
      app.get("/ok", async (_req, reply) => ok(reply, { hi: 1 }));
      await app.ready();
      const res = await app.inject({ method: "GET", url: "/ok" });
      assert.equal(res.statusCode, 200);
      await app.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
