import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadEnv } from "../../config/env.js";
import { baseEnv } from "../../test/helpers.js";
import { createFlightModule, createFlightProvider, FlightService } from "./index.js";

describe("createFlightModule / createFlightProvider", () => {
  it("wires mock provider", () => {
    const env = loadEnv(baseEnv());
    assert.equal(createFlightProvider(env).name, "mock");
    assert.equal(createFlightModule(env).service.providerName, "mock");
  });

  it("wires duffel provider", () => {
    const env = loadEnv(baseEnv({ PROVIDER_FLIGHTS: "duffel", DUFFEL_ACCESS_TOKEN: "t" }));
    assert.equal(createFlightModule(env).service.providerName, "duffel");
  });

  it("wires aviasales provider", () => {
    const env = loadEnv(
      baseEnv({ PROVIDER_FLIGHTS: "aviasales", TRAVELPAYOUTS_TOKEN: "tp-token" }),
    );
    assert.equal(createFlightModule(env).service.providerName, "aviasales");
  });

  it("throws on unknown provider", () => {
    assert.throws(
      () => createFlightModule(loadEnv(baseEnv({ PROVIDER_FLIGHTS: "nope" }))),
      /PROVIDER_FLIGHTS/,
    );
  });

  it("re-exports FlightService", async () => {
    const svc = new FlightService({ name: "x", searchFlights: async () => [] });
    assert.equal(await svc.getOffer("a"), null);
  });
});
