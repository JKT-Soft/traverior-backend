import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MockFlightProvider } from "../infra/mock-provider.js";
import { FlightService } from "./service.js";

describe("FlightService", () => {
  it("search + getOffer + providerName", async () => {
    const service = new FlightService(new MockFlightProvider());
    const offers = await service.search({
      origin: "CGK",
      destination: "KIX",
      departureDate: "2026-10-01",
      adults: 2,
    });
    assert.equal(offers[0]?.carrier, "Mock Air");
    assert.ok(await service.getOffer("mock-CGK-KIX"));
    assert.equal(await service.getOffer("other"), null);
    assert.equal(service.providerName, "mock");
  });

  it("getOffer returns null when provider has no getOffer", async () => {
    const svc = new FlightService({
      name: "x",
      searchFlights: async () => [],
    });
    assert.equal(await svc.getOffer("a"), null);
  });
});
