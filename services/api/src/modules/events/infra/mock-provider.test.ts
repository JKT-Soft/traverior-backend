import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MockEventProvider } from "./mock-provider.js";

describe("MockEventProvider", () => {
  it("includeFree / includePaid / searchTours", async () => {
    const mock = new MockEventProvider();
    assert.equal(mock.name, "mock");
    assert.equal((await mock.searchEvents({ city: "Osaka" })).length, 2);
    assert.ok(
      (await mock.searchEvents({ city: "Osaka", includeFree: false })).every(
        (e) => !e.isFree,
      ),
    );
    assert.ok(
      (await mock.searchEvents({ city: "Osaka", includePaid: false })).every(
        (e) => e.isFree,
      ),
    );
    assert.ok((await mock.searchTours!({ city: "Osaka" })).every((e) => !e.isFree));
  });
});
