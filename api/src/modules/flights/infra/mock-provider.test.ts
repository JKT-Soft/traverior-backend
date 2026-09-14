import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MockFlightProvider } from "./mock-provider.js";

describe("MockFlightProvider", () => {
  it("search defaults and getOffer branches", async () => {
    const mock = new MockFlightProvider();
    const offer = (
      await mock.searchFlights({
        origin: "CGK",
        destination: "KIX",
        departureDate: "2026-10-01",
      })
    )[0];
    assert.equal(offer?.cabin, "economy");
    assert.equal(offer?.carrier, "Garuda Indonesia");
    assert.equal(offer?.airline.iataCode, "GA");
    assert.equal(offer?.originAirport.terminal, "3");
    assert.equal(offer?.destinationAirport.name, "Kansai");
    assert.equal(offer?.transit, "direct");
    assert.equal(offer?.stops, 0);
    assert.deepEqual(offer?.baggage, [{ type: "checked", quantity: 1 }]);
    assert.equal(offer?.slices.length, 1);
    assert.equal(mock.name, "mock");

    class EmptyMock extends MockFlightProvider {
      override async searchFlights() {
        return [];
      }
    }
    assert.equal(await new EmptyMock().getOffer("mock-AAA-BBB"), null);
    assert.ok(await mock.getOffer("mock-"));
    assert.equal(await mock.getOffer("other"), null);
  });
});
