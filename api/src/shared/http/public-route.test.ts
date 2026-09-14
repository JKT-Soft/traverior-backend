import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPublicRoute } from "./public-route.js";

describe("isPublicRoute", () => {
  it("allows GET /health and Swagger docs", () => {
    assert.equal(isPublicRoute("GET", "/health"), true);
    assert.equal(isPublicRoute("GET", "/health?ready=1"), true);
    assert.equal(isPublicRoute("HEAD", "/health"), true);
    assert.equal(isPublicRoute("GET", "/docs"), true);
    assert.equal(isPublicRoute("GET", "/docs/"), true);
    assert.equal(isPublicRoute("GET", "/docs/json"), true);
    assert.equal(isPublicRoute("GET", "/docs/static/index.html"), true);
    assert.equal(isPublicRoute("HEAD", "/docs/json"), true);
    assert.equal(isPublicRoute("POST", "/v1/auth/test-token"), true);
    assert.equal(isPublicRoute("POST", "/v1/auth/test-token?x=1"), true);
    assert.equal(isPublicRoute("GET", "/v1/auth/test-token"), false);
    assert.equal(isPublicRoute("POST", "/health"), false);
    assert.equal(isPublicRoute("POST", "/docs"), false);
    assert.equal(isPublicRoute("GET", "/v1/auth/health"), false);
    assert.equal(isPublicRoute("POST", "/v1/flights/search"), false);
    assert.equal(isPublicRoute("GET", "/v1/auth/me"), false);
  });
});
