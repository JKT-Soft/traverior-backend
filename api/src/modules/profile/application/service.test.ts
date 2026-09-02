import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMockFn } from "../../../test/helpers.js";
import { ProfileService, serializeProfile } from "./service.js";

describe("ProfileService", () => {
  it("serializes profile with preferences", () => {
    const serialized = serializeProfile({
      id: "u1",
      email: "a@b.com",
      displayName: "A",
      photoUrl: null,
      locale: "id",
      homeCurrency: "IDR",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      preference: {
        budgetMax: 5000000,
        budgetStyle: "balanced",
        pace: "moderate",
        dietary: [],
        interests: [],
        travelWith: null,
        avoid: [],
        extra: null,
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
    });

    assert.equal(serialized.homeCurrency, "IDR");
    assert.equal(serialized.preferences?.budgetMax, 5000000);
  });

  it("updates user and upserts preferences", async () => {
    const updatedUser = {
      id: "u1",
      email: "a@b.com",
      displayName: "New Name",
      photoUrl: "https://example.com/p.jpg",
      locale: "en",
      homeCurrency: "USD",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-03T00:00:00.000Z"),
      preference: {
        budgetMax: null,
        budgetStyle: "luxury" as const,
        pace: "relaxed" as const,
        dietary: ["vegetarian"],
        interests: ["nature"],
        travelWith: "couple" as const,
        avoid: ["crowds"],
        extra: { passportCountry: "SG" },
        updatedAt: new Date("2026-01-03T00:00:00.000Z"),
      },
    };

    const update = createMockFn(async () => updatedUser);
    const service = new ProfileService({
      user: {
        upsert: createMockFn(),
        findUnique: createMockFn(),
        update,
      },
      userPreference: {},
    } as never);

    const profile = await service.updateProfile("u1", {
      displayName: "New Name",
      photoUrl: "https://example.com/p.jpg",
      locale: "en",
      homeCurrency: "USD",
      preferences: {
        budgetStyle: "luxury",
        pace: "relaxed",
        dietary: ["vegetarian"],
        interests: ["nature"],
        travelWith: "couple",
        avoid: ["crowds"],
        extra: { passportCountry: "SG" },
      },
    });

    assert.equal(profile.displayName, "New Name");
    assert.equal(profile.preferences?.budgetStyle, "luxury");
    assert.equal(profile.preferences?.extra?.passportCountry, "SG");
    assert.equal(update.mock.calls.length, 1);
  });
});
