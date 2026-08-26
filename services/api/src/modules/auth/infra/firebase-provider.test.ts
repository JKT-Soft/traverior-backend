import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UnauthorizedError } from "../../../shared/http/errors.js";
import { createMockFn, mockReq } from "../../../test/helpers.js";
import { FirebaseAuthProvider } from "./firebase-provider.js";

describe("FirebaseAuthProvider", () => {
  it("success, init, and invalid token", async () => {
    const verifyIdToken = createMockFn(async (token: string) => {
      if (token === "bad") throw new Error("bad");
      if (token === "tok2") return { uid: "u2" };
      return { uid: "u1", email: "a@b.c" };
    });
    const initializeApp = createMockFn((_opts: { projectId?: string }) => undefined);
    const apps: unknown[] = [];
    const loadAdmin = async () => ({
      apps,
      initializeApp: (opts: { projectId?: string }) => {
        initializeApp(opts);
        apps.push({});
      },
      auth: () => ({ verifyIdToken }),
    });

    const provider = new FirebaseAuthProvider("proj", loadAdmin);
    assert.equal(await provider.resolve(mockReq()), undefined);
    assert.deepEqual(
      await provider.resolve(mockReq({ headers: { authorization: "Bearer tok" } })),
      { uid: "u1", email: "a@b.c" },
    );
    assert.deepEqual(initializeApp.mock.calls[0]?.[0], { projectId: "proj" });

    initializeApp.mock.clear();
    await provider.resolve(mockReq({ headers: { authorization: "Bearer tok2" } }));
    assert.equal(initializeApp.mock.calls.length, 0);

    await assert.rejects(
      () => provider.resolve(mockReq({ headers: { authorization: "Bearer bad" } })),
      UnauthorizedError,
    );
  });

  it("default loadAdmin rejects invalid tokens", async () => {
    const provider = new FirebaseAuthProvider("traverior-test");
    await assert.rejects(
      () => provider.resolve(mockReq({ headers: { authorization: "Bearer not-a-real-token" } })),
      UnauthorizedError,
    );
  });
});
