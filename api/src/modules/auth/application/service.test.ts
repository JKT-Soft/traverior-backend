import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UnauthorizedError } from "../../../shared/http/errors.js";
import { mockReq } from "../../../test/helpers.js";
import { DevAuthProvider } from "../infra/dev-provider.js";
import { AuthService } from "./service.js";

describe("AuthService", () => {
  it("wraps provider", async () => {
    const service = new AuthService(new DevAuthProvider());
    assert.equal(service.providerName, "dev");
    assert.equal(service.requireUser({ uid: "x" }).uid, "x");
    assert.throws(() => service.requireUser(undefined), UnauthorizedError);
    const user = await service.resolve(mockReq({ headers: { authorization: "Bearer dev:z" } }));
    assert.equal(user?.uid, "z");
  });
});
