import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SavedPlaceService } from "./application/service.js";
import { createMockFn } from "../../test/helpers.js";
import { createSavedPlaceModule } from "./index.js";

describe("createSavedPlaceModule", () => {
  it("wires service and routes", () => {
    const mod = createSavedPlaceModule({
      user: { upsert: createMockFn() },
      savedPlace: { findMany: createMockFn() },
      stop: { findFirst: createMockFn() },
    } as never);
    assert.ok(mod.service instanceof SavedPlaceService);
    assert.equal(typeof mod.routes, "function");
  });
});
