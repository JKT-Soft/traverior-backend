import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadEnv } from "../../../config/env.js";
import { baseEnv, buildTestApp, injectJson } from "../../../test/helpers.js";
import { createFlightModule } from "../index.js";

describe("flight routes", () => {
  it("health + validation + search", async () => {
    const mod = createFlightModule(loadEnv(baseEnv()));
    const app = await buildTestApp(mod.routes);

    const health = await injectJson(app, "GET", "/health");
    assert.equal(health.json().data.module, "flights");

    const bad = await injectJson(app, "POST", "/search", { body: {} });
    assert.equal(bad.statusCode, 400);
    assert.equal(bad.json().error.code, "VALIDATION_ERROR");

    const badOrigin = await injectJson(app, "POST", "/search", {
      body: { origin: "CG" },
    });
    assert.equal(badOrigin.statusCode, 400);

    const search = await injectJson(app, "POST", "/search", {
      body: { origin: "CGK", destination: "KIX", departureDate: "2026-10-01", returnDate: "2026-10-08" },
    });
    assert.equal(search.statusCode, 200);
    const offer = search.json().data.offers[0];
    assert.equal(offer.airline.name, "Garuda Indonesia");
    assert.equal(offer.origin, "CGK");
    assert.equal(offer.destination, "KIX");
    assert.equal(offer.transit, "direct");
    assert.equal(offer.cabinLabel, "Economy");
    assert.equal(offer.slices.length, 2);
    assert.ok(offer.baggage.length > 0);

    const badDetail = await injectJson(app, "POST", "/offers/detail", { body: {} });
    assert.equal(badDetail.statusCode, 400);

    const detail = await injectJson(app, "POST", "/offers/detail", {
      body: {
        origin: "CGK",
        destination: "KIX",
        departureDate: "2026-10-01",
        flightNumber: offer.flightNumber,
        providerRef: offer.providerRef,
      },
    });
    assert.equal(detail.statusCode, 200);
    const detailData = detail.json().data;
    assert.equal(detailData.offer.origin, "CGK");
    assert.ok(Array.isArray(detailData.bookingOptions));
    assert.ok(detailData.bookingOptions.length >= 1);
    assert.match(detailData.bookingOptions[0].bookingUrl, /^https?:\/\//);

    await app.close();
  });
});
