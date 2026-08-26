import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AppError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "./errors.js";

describe("errors", () => {
  it("builds typed errors", () => {
    assert.equal(new AppError(400, "x").status, 400);
    assert.equal(new NotFoundError().code, "NOT_FOUND");
    assert.equal(new NotFoundError().message, "Not found");
    assert.equal(new UnauthorizedError().status, 401);
    assert.equal(new ValidationError("bad").message, "bad");
  });
});
