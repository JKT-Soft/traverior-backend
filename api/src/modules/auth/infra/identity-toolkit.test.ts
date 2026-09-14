import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError, UnauthorizedError } from "../../../shared/http/errors.js";
import { signInWithPassword } from "./identity-toolkit.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("signInWithPassword", () => {
  it("returns a bearer token on success", async () => {
    const token = await signInWithPassword({
      apiKey: "web-key",
      email: "a@b.c",
      password: "secret",
      fetchImpl: async (url, init) => {
        assert.match(String(url), /identitytoolkit\.googleapis\.com/);
        assert.match(String(url), /key=web-key/);
        assert.equal(init?.method, "POST");
        const body = JSON.parse(String(init?.body));
        assert.equal(body.email, "a@b.c");
        assert.equal(body.returnSecureToken, true);
        return jsonResponse(200, {
          idToken: "id-1",
          refreshToken: "r-1",
          expiresIn: "3600",
          email: "a@b.c",
          localId: "uid-1",
        });
      },
    });
    assert.equal(token.idToken, "id-1");
    assert.equal(token.tokenType, "Bearer");
    assert.equal(token.localId, "uid-1");
  });

  it("maps credential errors to 401", async () => {
    await assert.rejects(
      () =>
        signInWithPassword({
          apiKey: "k",
          email: "a@b.c",
          password: "bad",
          fetchImpl: async () =>
            jsonResponse(400, { error: { message: "INVALID_LOGIN_CREDENTIALS" } }),
        }),
      UnauthorizedError,
    );
  });

  it("maps other Firebase errors to 502", async () => {
    await assert.rejects(
      () =>
        signInWithPassword({
          apiKey: "k",
          email: "a@b.c",
          password: "x",
          fetchImpl: async () =>
            jsonResponse(400, { error: { message: "TOO_MANY_ATTEMPTS_TRY_LATER" } }),
        }),
      (err: unknown) => err instanceof AppError && err.code === "FIREBASE_SIGNIN_FAILED",
    );
  });

  it("fails when the body has no token", async () => {
    await assert.rejects(
      () =>
        signInWithPassword({
          apiKey: "k",
          email: "a@b.c",
          password: "x",
          fetchImpl: async () => jsonResponse(200, {}),
        }),
      AppError,
    );
  });

  it("fails when Firebase returns invalid JSON", async () => {
    await assert.rejects(
      () =>
        signInWithPassword({
          apiKey: "k",
          email: "a@b.c",
          password: "x",
          fetchImpl: async () => new Response("nope", { status: 500 }),
        }),
      AppError,
    );
  });

  it("fails when Firebase is unreachable", async () => {
    await assert.rejects(
      () =>
        signInWithPassword({
          apiKey: "k",
          email: "a@b.c",
          password: "x",
          fetchImpl: async () => {
            throw new Error("network");
          },
        }),
      (err: unknown) => err instanceof AppError && err.status === 502,
    );
  });

  it("uses global fetch when no impl is passed", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      jsonResponse(200, {
        idToken: "g",
        refreshToken: "r",
        expiresIn: "1",
        email: "a@b.c",
        localId: "u",
      })) as typeof fetch;
    try {
      const token = await signInWithPassword({
        apiKey: "k",
        email: "a@b.c",
        password: "x",
      });
      assert.equal(token.idToken, "g");
    } finally {
      globalThis.fetch = original;
    }
  });
});
