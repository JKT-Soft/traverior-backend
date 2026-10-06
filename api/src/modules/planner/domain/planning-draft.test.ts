import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canSearchDraft,
  draftCardFromSkeleton,
  draftsEqual,
  skeletonFromDraftCard,
} from "./planning-draft.js";
import type { TripSkeleton } from "./skeleton.js";

const japanSkeleton: TripSkeleton = {
  title: "Jepang",
  summary: "Tempo santai",
  concept: "culture",
  tone: "Tempo santai. Lebih banyak tempat dan acara.",
  originCity: "Jakarta",
  destinationSummary: "Tokyo, Kyoto",
  assumedStartDate: "2026-11-01",
  assumedEndDate: "2026-11-07",
  partySize: 2,
  checkpoints: [
    {
      city: "Tokyo",
      countryCode: "JP",
      airportIata: "NRT",
      role: "STAY",
      days: 4,
      needs: ["flights", "hotels", "places", "events"],
      search: { events: 2, restaurants: 3, places: 4 },
    },
    {
      city: "Kyoto",
      countryCode: "JP",
      airportIata: "KIX",
      role: "STAY",
      days: 3,
      needs: ["hotels", "places", "events"],
      search: { events: 1, restaurants: 3, places: 4 },
    },
  ],
};

describe("planning-draft", () => {
  it("builds hub/travel/stay cards with structural and editorial counts", () => {
    const card = draftCardFromSkeleton(japanSkeleton);
    assert.equal(card.concept, "culture");
    assert.equal(card.stops[0]?.kind, "hub");
    assert.equal(card.stops[1]?.kind, "travel");
    assert.equal(card.stops[1]?.search?.flights, 1);
    const tokyo = card.stops.find((stop) => stop.id === "stay_tokyo");
    assert.ok(tokyo);
    assert.equal(tokyo.search?.hotel, 1);
    assert.equal(tokyo.search?.events, 2);
    assert.equal(tokyo.search?.restaurants, 3);
    assert.equal(tokyo.nights, 4);
    assert.equal(card.selectedStopId, "stay_tokyo");
    assert.equal(canSearchDraft(card, "draft"), true);
  });

  it("round-trips draft card back to a searchable skeleton", () => {
    const card = draftCardFromSkeleton(japanSkeleton);
    const skeleton = skeletonFromDraftCard(card);
    assert.equal(skeleton.title, "Jepang");
    assert.equal(skeleton.checkpoints.length, 2);
    assert.ok(skeleton.checkpoints[0]?.needs.includes("flights"));
    assert.ok(skeleton.checkpoints[0]?.needs.includes("hotels"));
    assert.equal(skeleton.checkpoints[0]?.search?.events, 2);
  });

  it("detects draft changes for history cards", () => {
    const a = draftCardFromSkeleton(japanSkeleton);
    const b = draftCardFromSkeleton({
      ...japanSkeleton,
      checkpoints: [
        {
          ...japanSkeleton.checkpoints[0]!,
          search: { events: 1, restaurants: 3, places: 4 },
        },
        japanSkeleton.checkpoints[1]!,
      ],
    });
    assert.equal(draftsEqual(a, a), true);
    assert.equal(draftsEqual(a, b), false);
  });
});
