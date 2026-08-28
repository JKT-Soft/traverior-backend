import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InProcessMcpClient } from "./in-process-client.js";
import { parseMcpToolPayload } from "./parse-result.js";
import { serverForTool } from "./tool-registry.js";

describe("parseMcpToolPayload", () => {
  it("parses ok and error envelopes", () => {
    const ok = parseMcpToolPayload("search_flights", {
      content: [
        {
          type: "text",
          text: JSON.stringify({ ok: true, data: { offers: [] }, fetchedAt: "t" }),
        },
      ],
    });
    assert.equal(ok.ok, true);
    assert.deepEqual((ok.data as { offers: unknown[] }).offers, []);

    const err = parseMcpToolPayload("search_flights", {
      isError: true,
      content: [{ type: "text", text: JSON.stringify({ ok: false, error: "boom" }) }],
    });
    assert.equal(err.ok, false);
    assert.equal(err.error, "boom");
  });
});

describe("InProcessMcpClient", () => {
  it("dispatches search_flights and search_hotels", async () => {
    const client = new InProcessMcpClient({
      flights: {
        providerName: "mock",
        search: async () => [{ id: "f1" }],
        getOffer: async () => null,
      },
      hotels: {
        providerName: "mock",
        search: async () => [{ id: "h1" }],
      },
      places: {
        providerName: "mock",
        searchRestaurants: async () => [],
        searchPois: async () => [],
        search: async () => [],
      },
      routes: { providerName: "mock", getRoute: async () => ({ durationMinutes: 1 }) },
      weather: { providerName: "mock", getForecast: async () => ({ alerts: [] }) },
      events: { providerName: "mock", search: async () => [] },
      visa: {
        providerName: "static",
        getRequirements: async () => ({ documents: ["passport"] }),
      },
      checklist: {
        providerName: "internal",
        generate: async () => ({ items: [] }),
      },
    });

    const flights = await client.callTool("search_flights", {
      origin: "CGK",
      destination: "KIX",
      departureDate: "2026-10-01",
    });
    assert.equal(flights.ok, true);

    const hotels = await client.callTool("search_hotels", {
      cityName: "Osaka",
      checkIn: "2026-10-01",
      checkOut: "2026-10-04",
    });
    assert.equal(hotels.ok, true);
    assert.equal(client.name, "inprocess");
  });

  it("returns tool error envelope on failure", async () => {
    const client = new InProcessMcpClient({
      flights: {
        providerName: "mock",
        search: async () => {
          throw new Error("provider down");
        },
      },
      hotels: { providerName: "mock", search: async () => [] },
      places: {
        providerName: "mock",
        searchRestaurants: async () => [],
        searchPois: async () => [],
        search: async () => [],
      },
      routes: { providerName: "mock", getRoute: async () => ({}) },
      weather: { providerName: "mock", getForecast: async () => ({}) },
      events: { providerName: "mock", search: async () => [] },
      visa: { providerName: "static", getRequirements: async () => ({}) },
      checklist: { providerName: "internal", generate: async () => ({}) },
    });
    const result = await client.callTool("search_flights", {
      origin: "CGK",
      destination: "KIX",
      departureDate: "2026-10-01",
    });
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /provider down/);
  });
});

describe("serverForTool", () => {
  it("maps tool to server id", () => {
    assert.equal(serverForTool("search_flights"), "flights");
    assert.equal(serverForTool("generate_checklist"), "checklist");
  });
});
