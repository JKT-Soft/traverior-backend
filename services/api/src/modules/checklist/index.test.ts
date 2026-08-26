import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createChecklistModule } from "./index.js";

describe("createChecklistModule", () => {
  it("wires template provider", () => {
    assert.equal(createChecklistModule().service.providerName, "internal");
  });
});
