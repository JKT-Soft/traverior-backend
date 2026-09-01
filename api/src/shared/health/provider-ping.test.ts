import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadEnv } from "../../config/env.js";
import { baseEnv } from "../../test/helpers.js";
import {
  healthMark,
  pingExternalProviders,
  pingHttp,
  skippedPing,
} from "./provider-ping.js";

function jsonResponse(status: number, body = ""): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    arrayBuffer: async () => new ArrayBuffer(0),
    text: async () => body,
  } as Response;
}

describe("healthMark", () => {
  it("returns checklist or wrong emoji", () => {
    assert.equal(healthMark(true), "✅");
    assert.equal(healthMark(false), "❌");
  });
});

describe("skippedPing", () => {
  it("marks local providers as skipped", () => {
    assert.deepEqual(skippedPing("flights", "mock"), {
      id: "flights",
      provider: "mock",
      ok: true,
      mark: "✅",
      skipped: true,
      ms: 0,
    });
  });
});

describe("pingHttp", () => {
  it("returns ok only for 2xx", async () => {
    const ok = await pingHttp("flights", "duffel", "https://example.test", {}, async () =>
      jsonResponse(200),
    );
    assert.equal(ok.ok, true);
    assert.equal(ok.mark, "✅");
    assert.equal(ok.status, 200);

    const notFound = await pingHttp("places", "google", "https://example.test", {}, async () =>
      jsonResponse(404),
    );
    assert.equal(notFound.ok, false);
    assert.equal(notFound.mark, "❌");
    assert.equal(notFound.status, 404);
    assert.equal(notFound.error, "HTTP 404");

    const unauthorized = await pingHttp("flights", "duffel", "https://example.test", {}, async () =>
      jsonResponse(401),
    );
    assert.equal(unauthorized.ok, false);
    assert.equal(unauthorized.mark, "❌");
    assert.equal(unauthorized.status, 401);
  });

  it("fails on 5xx and drains body even if arrayBuffer throws", async () => {
    const fail = await pingHttp("hotels", "liteapi", "https://example.test", {}, async () =>
      jsonResponse(503),
    );
    assert.equal(fail.ok, false);
    assert.equal(fail.mark, "❌");
    assert.equal(fail.error, "HTTP 503");

    const drain = await pingHttp("hotels", "liteapi", "https://example.test", {}, async () =>
      ({
        status: 204,
        body: {
          cancel: async () => {
            throw new Error("closed");
          },
        },
      }) as unknown as Response,
    );
    assert.equal(drain.ok, true);
    assert.equal(drain.status, 204);

    const noCancel = await pingHttp("hotels", "liteapi", "https://example.test", {}, async () =>
      ({
        status: 200,
        body: {},
      }) as unknown as Response,
    );
    assert.equal(noCancel.ok, true);
  });

  it("captures Error and non-Error rejections", async () => {
    const fromError = await pingHttp("weather", "openweather", "https://example.test", {}, async () => {
      throw new Error("timeout");
    });
    assert.equal(fromError.ok, false);
    assert.equal(fromError.mark, "❌");
    assert.match(fromError.error ?? "", /timeout/);

    const fromString = await pingHttp("weather", "openweather", "https://example.test", {}, async () => {
      throw "nope";
    });
    assert.equal(fromString.ok, false);
    assert.equal(fromString.error, "nope");
  });

  it("forwards custom abort signal", async () => {
    const signal = AbortSignal.abort();
    let seen: AbortSignal | undefined;
    await pingHttp(
      "llm",
      "openai",
      "https://example.test",
      { signal },
      async (_url, init) => {
        seen = init?.signal as AbortSignal;
        return jsonResponse(200);
      },
    );
    assert.equal(seen, signal);
  });

  it("accepts a longer timeout for slow providers", async () => {
    const result = await pingHttp(
      "llm",
      "openai",
      "https://example.test",
      {},
      async () => jsonResponse(200),
      12_000,
    );
    assert.equal(result.ok, true);
  });
});

describe("pingExternalProviders", () => {
  it("skips mock/static/heuristic providers", async () => {
    const result = await pingExternalProviders(loadEnv(baseEnv()), async () => {
      throw new Error("should not fetch");
    });
    assert.equal(result.status, "ok");
    assert.equal(result.mark, "✅");
    assert.equal(result.checks.length, 9);
    assert.ok(result.checks.every((c) => c.ok && c.skipped && c.mark === "✅"));
    assert.deepEqual(
      result.checks.map((c) => c.id),
      ["flights", "hotels", "places", "routes", "weather", "events", "visa", "images", "llm"],
    );
  });

  it("pings live providers in parallel and degrades on failure", async () => {
    const seen: string[] = [];
    const env = loadEnv(
      baseEnv({
        PROVIDER_FLIGHTS: "duffel",
        DUFFEL_ACCESS_TOKEN: "d",
        PROVIDER_HOTELS: "liteapi",
        LITEAPI_KEY: "l",
        PROVIDER_PLACES: "google",
        PROVIDER_ROUTES: "google",
        GOOGLE_MAPS_API_KEY: "g",
        PROVIDER_WEATHER: "openweather",
        OPENWEATHER_API_KEY: "o",
        PROVIDER_EVENTS: "eventbrite",
        EVENTBRITE_TOKEN: "e",
        PROVIDER_VISA: "sherpa",
        SHERPA_API_KEY: "s",
        PROVIDER_IMAGES: "unsplash",
        UNSPLASH_ACCESS_KEY: "u",
        LLM_PROVIDER: "openai",
        OPENAI_API_KEY: "sk",
        OPENAI_BASE_URL: "https://llm.example/v1",
      }),
    );

    const result = await pingExternalProviders(env, async (input) => {
      const url = String(input);
      seen.push(url);
      if (url.includes("liteapi")) return jsonResponse(503);
      return jsonResponse(200);
    });

    assert.equal(result.status, "degraded");
    assert.equal(result.mark, "❌");
    const byId = Object.fromEntries(result.checks.map((c) => [c.id, c]));
    assert.equal(byId.flights?.ok, true);
    assert.equal(byId.flights?.mark, "✅");
    assert.equal(byId.hotels?.ok, false);
    assert.equal(byId.hotels?.mark, "❌");
    assert.equal(byId.places?.ok, true);
    assert.equal(byId.routes?.ok, true);
    assert.equal(byId.weather?.ok, true);
    assert.equal(byId.events?.ok, true);
    assert.equal(byId.visa?.skipped, true);
    assert.equal(byId.images?.ok, true);
    assert.equal(byId.llm?.ok, true);
    assert.ok(seen.some((u) => u.includes("api.duffel.com")));
    assert.ok(seen.some((u) => u.includes("liteapi.travel")));
    assert.ok(seen.some((u) => u.includes("places.googleapis.com/v1/places:searchText")));
    assert.ok(seen.some((u) => u.includes("routes.googleapis.com/directions/v2:computeRoutes")));
    assert.ok(seen.some((u) => u.includes("openweathermap.org")));
    assert.ok(seen.some((u) => u.includes("eventbriteapi.com")));
    assert.ok(seen.some((u) => u.includes("api.unsplash.com")));
    assert.ok(seen.some((u) => u.includes("llm.example/v1/models/gpt-4o-mini")));
  });

  it("reports missing keys for live providers", async () => {
    const result = await pingExternalProviders(
      loadEnv(
        baseEnv({
          PROVIDER_FLIGHTS: "duffel",
          PROVIDER_HOTELS: "liteapi",
          PROVIDER_PLACES: "google",
          PROVIDER_ROUTES: "google",
          PROVIDER_WEATHER: "openweather",
          PROVIDER_EVENTS: "eventbrite",
          PROVIDER_IMAGES: "unsplash",
          LLM_PROVIDER: "openai",
        }),
      ),
      async () => jsonResponse(200),
    );
    assert.equal(result.status, "degraded");
    assert.equal(result.mark, "❌");
    assert.ok(result.checks.filter((c) => !c.ok).every((c) => c.mark === "❌"));
    const errors = result.checks.filter((c) => !c.ok).map((c) => c.error);
    assert.ok(errors.some((e) => e?.includes("DUFFEL")));
    assert.ok(errors.some((e) => e?.includes("LITEAPI")));
    assert.ok(errors.some((e) => e?.includes("GOOGLE_MAPS")));
    assert.ok(errors.some((e) => e?.includes("OPENWEATHER")));
    assert.ok(errors.some((e) => e?.includes("EVENTBRITE")));
    assert.ok(errors.some((e) => e?.includes("UNSPLASH")));
    assert.ok(errors.some((e) => e?.includes("OPENAI")));
  });

  it("pings Eventbrite for composite when token is set, otherwise skips", async () => {
    const withToken = await pingExternalProviders(
      loadEnv(baseEnv({ PROVIDER_EVENTS: "composite", EVENTBRITE_TOKEN: "e" })),
      async () => jsonResponse(200),
    );
    assert.equal(withToken.checks.find((c) => c.id === "events")?.ok, true);
    assert.equal(withToken.checks.find((c) => c.id === "events")?.skipped, undefined);

    const withoutToken = await pingExternalProviders(
      loadEnv(baseEnv({ PROVIDER_EVENTS: "composite" })),
      async () => {
        throw new Error("should not fetch");
      },
    );
    assert.equal(withoutToken.checks.find((c) => c.id === "events")?.skipped, true);

    const viator = await pingExternalProviders(
      loadEnv(baseEnv({ PROVIDER_EVENTS: "viator", VIATOR_API_KEY: "v" })),
      async () => {
        throw new Error("should not fetch");
      },
    );
    assert.equal(viator.checks.find((c) => c.id === "events")?.skipped, true);
  });

  it("uses default OpenAI base URL", async () => {
    const result = await pingExternalProviders(
      loadEnv(baseEnv({ LLM_PROVIDER: "openai", OPENAI_API_KEY: "sk" })),
      async (input) => {
        assert.equal(String(input), "https://api.openai.com/v1/models/gpt-4o-mini");
        return jsonResponse(200);
      },
    );
    assert.equal(result.checks.find((c) => c.id === "llm")?.ok, true);
  });
});
