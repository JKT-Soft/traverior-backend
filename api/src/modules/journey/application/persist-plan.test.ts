import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPlanDrafts, parentPathOf } from "./persist-plan.js";

describe("persist-plan", () => {
  it("parentPathOf strips last segment", () => {
    assert.equal(parentPathOf("journey/stay_osaka"), "journey");
    assert.equal(parentPathOf("journey/stay_osaka/search_hotels_1"), "journey/stay_osaka");
  });

  it("builds top-level stops and attaches the hotel booking to the stay", () => {
    const drafts = buildPlanDrafts(
      {
        title: "Japan",
        checkpoints: [
          {
            city: "Osaka",
            countryCode: "JP",
            role: "STAY",
            days: 2,
            needs: ["hotels"],
          },
        ],
      },
      {
        checkpoints: [
          {
            checkpoint: {
              city: "Osaka",
              role: "STAY",
              days: 2,
              needs: ["hotels"],
            },
            results: [
              {
                ok: true,
                tool: "search_hotels",
                data: {
                  provider: "mock",
                  hotels: [
                    {
                      hotelId: "h1",
                      name: "Hotel A",
                      price: { amount: 100, currency: "USD" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    );

    assert.equal(drafts[0]?.kind, "hub");
    assert.equal(drafts[0]?.hubRole, "origin");
    assert.equal(drafts[0]?.name, "Jakarta");
    assert.equal(drafts[1]?.kind, "travel");
    const stay = drafts[2];
    assert.equal(stay?.kind, "stay");
    assert.equal(stay?.path, "journey/stay_osaka");
    assert.equal(stay?.bookings[0]?.kind, "hotel");
    assert.equal(stay?.bookings[0]?.payload.name, "Hotel A");
    assert.equal(stay?.bookings[0]?.costAmount, 100);
    assert.equal(drafts[3]?.kind, "travel");
    assert.equal(drafts[4]?.hubRole, "return");
  });

  it("builds origin, destination, and return stops when home city is provided", () => {
    const drafts = buildPlanDrafts(
      {
        title: "Japan",
        originCity: "Jakarta",
        checkpoints: [
          {
            city: "Osaka",
            countryCode: "JP",
            role: "STAY",
            days: 2,
            needs: ["hotels"],
          },
        ],
      },
      {
        checkpoints: [
          {
            checkpoint: {
              city: "Osaka",
              role: "STAY",
              days: 2,
              needs: ["hotels"],
            },
            results: [
              {
                ok: true,
                tool: "search_hotels",
                data: {
                  provider: "mock",
                  hotels: [
                    {
                      hotelId: "h1",
                      name: "Hotel A",
                      price: { amount: 100, currency: "USD" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      { originCity: "Jakarta", returnCity: "Jakarta" },
    );

    assert.equal(drafts[0]?.hubRole, "origin");
    assert.equal(drafts[1]?.kind, "travel");
    assert.equal(drafts[2]?.name, "Osaka");
    assert.equal(drafts[3]?.kind, "travel");
    assert.equal(drafts[4]?.hubRole, "return");
    assert.match(drafts[4]?.name ?? "", /Jakarta/i);
  });

  it("stores checklist bookings and travel-tip notes on the stay", () => {
    const drafts = buildPlanDrafts(
      {
        title: "Japan",
        originCity: "Jakarta",
        checkpoints: [
          {
            city: "Osaka",
            countryCode: "JP",
            role: "STAY",
            days: 2,
            needs: ["checklist"],
          },
        ],
      },
      {
        checkpoints: [
          {
            checkpoint: {
              city: "Osaka",
              role: "STAY",
              days: 2,
              needs: ["checklist"],
            },
            results: [
              {
                ok: true,
                tool: "generate_checklist",
                data: {
                  provider: "internal",
                  checklist: { items: [{ id: "passport", label: "Passport", done: false }] },
                  tips: [
                    {
                      id: "getting-around",
                      category: "getting_around",
                      title: "Getting around",
                      body: "Use an IC card in Osaka.",
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      { originCity: "Jakarta", returnCity: "Jakarta" },
    );

    const stay = drafts.find((draft) => draft.kind === "stay");
    assert.equal(stay?.bookings[0]?.kind, "checklist");
    const tip = stay?.notes.find((note) => note.title === "Getting around");
    assert.equal(tip?.body, "Use an IC card in Osaka.");
  });

  it("assigns contiguous stay dates across destination stops", () => {
    const drafts = buildPlanDrafts(
      {
        title: "Europe",
        originCity: "Jakarta",
        checkpoints: [
          { city: "London", countryCode: "GB", role: "STAY", days: 2, needs: [] },
          { city: "Barcelona", countryCode: "ES", role: "STAY", days: 2, needs: [] },
          { city: "Paris", countryCode: "FR", role: "STAY", days: 2, needs: [] },
        ],
      },
      { checkpoints: [] },
      { originCity: "Jakarta", returnCity: "Jakarta", startDate: "2026-10-01", endDate: "2026-10-04" },
    );

    const stays = drafts.filter((draft) => draft.kind === "stay");
    assert.deepEqual(
      stays.map((draft) => ({
        title: draft.name,
        start: draft.scheduleStart?.toISOString().slice(0, 10),
        end: draft.scheduleEnd?.toISOString().slice(0, 10),
        days: draft.days,
      })),
      [
        { title: "London", start: "2026-10-01", end: "2026-10-02", days: 2 },
        { title: "Barcelona", start: "2026-10-03", end: "2026-10-03", days: 1 },
        { title: "Paris", start: "2026-10-04", end: "2026-10-04", days: 1 },
      ],
    );
  });
});
