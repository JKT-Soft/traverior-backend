import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { loadEnv } from "../../../config/env.js";
import { baseEnv, stubFetch } from "../../../test/helpers.js";
import {
  createEventbriteEventProvider,
  EventbriteEventProvider,
  eventbriteCitySlug,
} from "./eventbrite-provider.js";

let restoreFetch: (() => void) | undefined;

afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
});

describe("EventbriteEventProvider", () => {
  it("createEventbriteEventProvider requires token", () => {
    assert.throws(
      () =>
        createEventbriteEventProvider(
          loadEnv(baseEnv({ PROVIDER_EVENTS: "eventbrite" })),
        ),
      /EVENTBRITE_TOKEN/,
    );
    assert.equal(
      createEventbriteEventProvider(
        loadEnv(baseEnv({ PROVIDER_EVENTS: "eventbrite", EVENTBRITE_TOKEN: "tok" })),
      ).name,
      "eventbrite",
    );
  });

  it("maps city slugs", () => {
    assert.equal(eventbriteCitySlug("Osaka"), "japan--osaka");
    assert.equal(eventbriteCitySlug("New York"), "ny--new-york");
    assert.equal(eventbriteCitySlug("My City"), "my-city");
  });

  it("uses official search when available", async () => {
    const p = new EventbriteEventProvider("tok");
    restoreFetch = stubFetch(async (input) => {
      const url = String(input);
      assert.match(url, /eventbriteapi\.com\/v3\/events\/search/);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          events: [
            {
              id: "eb-1",
              name: { text: "Free Meetup" },
              url: "https://www.eventbrite.com/e/1",
              start: { utc: "2026-10-01T10:00:00Z" },
              is_free: true,
            },
            {
              id: "eb-2",
              name: { text: "Paid Concert" },
              url: "https://www.eventbrite.com/e/2",
              is_free: false,
              ticket_availability: {
                minimum_ticket_price: {
                  currency: "JPY",
                  value: 350000,
                  major_value: "3500.00",
                },
              },
            },
          ],
        }),
      } as Response;
    });

    const both = await p.searchEvents({ city: "Osaka", startDate: "2026-10-01", endDate: "2026-10-04" });
    assert.equal(both.length, 2);
    assert.equal(both[0]?.source, "eventbrite");
    assert.equal(both[1]?.price.amount, 3500);
  });

  it("falls back to discovery JSON-LD when search returns 404", async () => {
    const p = new EventbriteEventProvider("tok");
    const calls: string[] = [];
    restoreFetch = stubFetch(async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("eventbriteapi.com")) {
        return { ok: false, status: 404, text: async () => "NOT_FOUND" } as Response;
      }
      const ld = JSON.stringify({
        itemListElement: [
          {
            item: {
              "@type": "Event",
              name: "Osaka Language Exchange",
              url: "https://www.eventbrite.com/e/osaka-exchange-tickets-1871990456849",
              startDate: "2026-10-02",
              isAccessibleForFree: true,
            },
          },
          {
            item: {
              "@type": "Event",
              name: "Paid Workshop",
              url: "https://www.eventbrite.com/e/paid-workshop-tickets-999",
              startDate: "2026-10-03",
              offers: { price: "25.00", priceCurrency: "USD" },
            },
          },
          {
            item: {
              "@type": "Event",
              name: "Too Early",
              url: "https://www.eventbrite.com/e/early-tickets-1",
              startDate: "2026-09-01",
            },
          },
        ],
      });
      return {
        ok: true,
        status: 200,
        text: async () => `<html><script type="application/ld+json">${ld}</script></html>`,
      } as Response;
    });

    const events = await p.searchEvents({
      city: "Osaka",
      startDate: "2026-10-01",
      endDate: "2026-10-04",
    });
    assert.ok(calls.some((u) => u.includes("eventbrite.com/d/japan--osaka/events")));
    assert.equal(events.length, 2);
    assert.equal(events[0]?.name, "Osaka Language Exchange");
    assert.equal(events[0]?.isFree, true);
    assert.equal(events[0]?.externalId, "1871990456849");
    assert.equal(events[1]?.price.amount, 25);
    assert.ok(!events.some((e) => e.name === "Too Early"));
  });

  it("throws on non-404 API errors", async () => {
    const p = new EventbriteEventProvider("tok");
    restoreFetch = stubFetch(
      async () => ({ ok: false, status: 401, text: async () => "unauthorized" }) as Response,
    );
    await assert.rejects(() => p.searchEvents({ city: "Osaka" }), /Eventbrite API failed/);
  });

  it("returns empty when both free and paid excluded", async () => {
    const p = new EventbriteEventProvider("tok");
    assert.deepEqual(
      await p.searchEvents({ city: "Osaka", includeFree: false, includePaid: false }),
      [],
    );
  });
});
