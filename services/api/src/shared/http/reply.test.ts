import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Fastify from "fastify";
import { fail, ok } from "./reply.js";

describe("reply helpers", () => {
  it("ok and fail serialize envelope", async () => {
    const app = Fastify({ logger: false });
    app.get("/ok", async (_req, reply) => ok(reply, { a: 1 }));
    app.get("/created", async (_req, reply) => ok(reply, { a: 2 }, 201));
    app.get("/fail", async (_req, reply) => fail(reply, 400, "X", "msg"));
    await app.ready();

    const a = await app.inject({ method: "GET", url: "/ok" });
    assert.equal(a.statusCode, 200);
    assert.deepEqual(a.json(), { ok: true, data: { a: 1 } });

    const b = await app.inject({ method: "GET", url: "/created" });
    assert.equal(b.statusCode, 201);

    const c = await app.inject({ method: "GET", url: "/fail" });
    assert.equal(c.statusCode, 400);
    assert.deepEqual(c.json(), { ok: false, error: { code: "X", message: "msg" } });

    await app.close();
  });
});
