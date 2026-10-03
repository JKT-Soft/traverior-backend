import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPlanNodeDrafts, parentPathOf } from "./persist-plan.js";

describe("persist-plan", () => {
  it("parentPathOf strips last segment", () => {
    assert.equal(parentPathOf("trip/osaka"), "trip");
    assert.equal(parentPathOf("trip/osaka/hotels-1"), "trip/osaka");
  });

  it("builds checkpoint + tool child drafts with default origin hub", () => {
    const drafts = buildPlanNodeDrafts(
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

    assert.equal(drafts[0]?.type, "CHECKPOINT");
    assert.equal(drafts[0]?.checkpointKind, "ORIGIN");
    assert.equal(drafts[0]?.title, "Jakarta");
    assert.equal(drafts[1]?.type, "LEG");
    assert.equal(drafts[2]?.type, "CHECKPOINT");
    assert.equal(drafts[2]?.path, "trip/osaka");
    assert.equal(drafts[3]?.type, "BOOKING");
    assert.equal(drafts[3]?.title, "Hotel A");
    assert.equal(drafts[3]?.costAmount, 100);
    assert.ok(drafts[3]?.path.startsWith("trip/osaka/"));
    assert.equal(drafts[4]?.type, "LEG");
    assert.equal(drafts[5]?.checkpointKind, "RETURN");
  });

  it("builds origin, destination, and return pipeline when home city is provided", () => {
    const drafts = buildPlanNodeDrafts(
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

    assert.equal(drafts[0]?.checkpointKind, "ORIGIN");
    assert.equal(drafts[1]?.type, "LEG");
    assert.equal(drafts[2]?.title, "Osaka");
    assert.equal(drafts[4]?.type, "LEG");
    assert.equal(drafts[5]?.checkpointKind, "RETURN");
    assert.match(drafts[5]?.title ?? "", /Jakarta/i);
  });

  it("persists travel.tips child when checklist includes tips", () => {
    const drafts = buildPlanNodeDrafts(
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

    const checklist = drafts.find((d) => d.contentType === "checklist");
    const tips = drafts.find((d) => d.contentType === "travel.tips");
    assert.ok(checklist);
    assert.ok(tips);
    assert.equal(tips?.title, "Travel tips");
    const content = tips?.content as { tips?: Array<{ title?: string }> };
    assert.equal(content.tips?.[0]?.title, "Getting around");
  });

  it("assigns contiguous stay dates across destination checkpoints", () => {
    const drafts = buildPlanNodeDrafts(
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

    const stays = drafts.filter((draft) => draft.checkpointKind === "STAY");
    assert.deepEqual(
      stays.map((draft) => ({
        title: draft.title,
        start: draft.scheduleStart?.toISOString().slice(0, 10),
        end: draft.scheduleEnd?.toISOString().slice(0, 10),
        days: (draft.content as { days?: number } | undefined)?.days,
      })),
      [
        { title: "London", start: "2026-10-01", end: "2026-10-02", days: 2 },
        { title: "Barcelona", start: "2026-10-03", end: "2026-10-03", days: 1 },
        { title: "Paris", start: "2026-10-04", end: "2026-10-04", days: 1 },
      ],
    );
  });
});
