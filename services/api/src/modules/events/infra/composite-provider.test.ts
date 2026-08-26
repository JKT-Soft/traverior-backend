import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { loadEnv } from "../../../config/env.js";
import { baseEnv, stubFetch } from "../../../test/helpers.js";
import {
  CompositeEventProvider,
  createEventProvider,
} from "./composite-provider.js";

let restoreFetch: (() => void) | undefined;

afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
});

describe("CompositeEventProvider / createEventProvider", () => {
  it("token and includeFree/Paid branches", async () => {
    restoreFetch = stubFetch(async () => {
      return {
        ok: true,
        json: async () => ({
          events: [
            {
              id: "eb-1",
              name: { text: "Live Event" },
              url: "https://www.eventbrite.com/e/1",
              is_free: true,
            },
          ],
        }),
      } as Response;
    });

    const withTokens = createEventProvider(
      loadEnv(
        baseEnv({
          PROVIDER_EVENTS: "composite",
          EVENTBRITE_TOKEN: "e",
          VIATOR_API_KEY: "v",
        }),
      ),
    );
    assert.equal(withTokens.name, "eventbrite+viator");
    const mixed = await withTokens.searchEvents({ city: "Tokyo" });
    assert.ok(mixed.some((e) => e.source === "eventbrite"));
    assert.ok(mixed.some((e) => e.source === "viator"));

    const onlyEb = createEventProvider(
      loadEnv(baseEnv({ PROVIDER_EVENTS: "eventbrite", EVENTBRITE_TOKEN: "e" })),
    );
    assert.equal(onlyEb.name, "eventbrite");
    const ebOnly = await onlyEb.searchEvents({ city: "Tokyo" });
    assert.ok(ebOnly.every((e) => e.source === "eventbrite"));
    assert.ok(ebOnly.every((e) => !String(e.providerRef).startsWith("mock-")));

    const onlyViator = createEventProvider(
      loadEnv(baseEnv({ PROVIDER_EVENTS: "viator", VIATOR_API_KEY: "v" })),
    );
    assert.equal(onlyViator.name, "viator");
    await onlyViator.searchEvents({ city: "Tokyo", includeFree: false });

    restoreFetch();
    restoreFetch = undefined;

    const noTokensPaidFree = createEventProvider(
      loadEnv(baseEnv({ PROVIDER_EVENTS: "composite" })),
    );
    await noTokensPaidFree.searchEvents({
      city: "Tokyo",
      includeFree: true,
      includePaid: true,
    });
    await noTokensPaidFree.searchEvents({
      city: "Tokyo",
      includeFree: false,
      includePaid: false,
    });
  });

  it("fallback without searchTours", async () => {
    const fallback = {
      name: "stub",
      searchEvents: async () => [],
    };
    const provider = new CompositeEventProvider("eb", "vi", fallback, {
      name: "eventbrite",
      searchEvents: async () => [],
    });
    const results = await provider.searchEvents({ city: "Tokyo" });
    assert.equal(results.length, 0);
  });

  it("throws on unknown provider", () => {
    assert.throws(
      () => createEventProvider(loadEnv(baseEnv({ PROVIDER_EVENTS: "x" }))),
      /PROVIDER_EVENTS/,
    );
  });

  it("eventbrite mode requires token", () => {
    assert.throws(
      () => createEventProvider(loadEnv(baseEnv({ PROVIDER_EVENTS: "eventbrite" }))),
      /EVENTBRITE_TOKEN/,
    );
  });
});
