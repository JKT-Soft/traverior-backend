import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPublicRoute } from "./public-route.js";

describe("isPublicRoute", () => {
  it("allows GET /health only", () => {
    assert.equal(isPublicRoute("GET", "/health"), true);
    assert.equal(isPublicRoute("GET", "/health?ready=1"), true);
    assert.equal(isPublicRoute("POST", "/health"), false);
    assert.equal(isPublicRoute("GET", "/v1/auth/health"), false);
    assert.equal(isPublicRoute("POST", "/v1/flights/search"), false);
    assert.equal(isPublicRoute("GET", "/v1/auth/me"), false);
  });
});
