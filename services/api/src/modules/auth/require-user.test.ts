import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UnauthorizedError } from "../../shared/http/errors.js";
import { requireUser } from "./require-user.js";

describe("requireUser", () => {
  it("throws when missing and returns user when present", () => {
    assert.throws(() => requireUser(undefined), UnauthorizedError);
    assert.equal(requireUser({ uid: "1" }).uid, "1");
  });
});
