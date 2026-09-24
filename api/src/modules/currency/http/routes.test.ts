import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTestApp, injectJson } from "../../../test/helpers.js";
import { createCurrencyModule } from "../index.js";

describe("currency rates", () => {
  it("returns rates for the requested base currency", async () => {
    const { routes } = createCurrencyModule(undefined, async (base) => ({
      base,
      rates: { IDR: 1, USD: 0.000063 },
    }));
    const app = await buildTestApp(routes, {
      prefix: "/v1/currency",
      user: { uid: "user-1" },
    });

    const response = await injectJson(app, "GET", "/v1/currency/rates?base=idr");
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.ok, true);
    assert.equal(body.data.base, "IDR");
    assert.equal(body.data.rates.USD, 0.000063);
    await app.close();
  });
});
