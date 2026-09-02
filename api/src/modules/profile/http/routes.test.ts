import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { buildTestApp, createMockFn, injectJson, type MockFn } from "../../../test/helpers.js";
import { createProfileModule } from "../index.js";

function createPrismaMock(): {
  user: {
    upsert: MockFn<(...args: never[]) => Promise<unknown>>;
    findUnique: MockFn<(...args: never[]) => Promise<unknown>>;
    update: MockFn<(...args: never[]) => Promise<unknown>>;
  };
} {
  return {
    user: {
      upsert: createMockFn(async () => ({ id: "user-1", firebaseUid: "fb", email: "a@b.com" })),
      findUnique: createMockFn(async () => null),
      update: createMockFn(async () => ({})),
    },
  };
}

const sampleUser = {
  id: "user-1",
  email: "traveler@example.com",
  displayName: "Agus",
  photoUrl: null,
  locale: "id",
  homeCurrency: "IDR",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  preference: {
    budgetMax: null,
    budgetStyle: "balanced" as const,
    pace: "moderate" as const,
    dietary: ["halal"],
    interests: ["culture", "food"],
    travelWith: "solo" as const,
    avoid: [],
    extra: { passportCountry: "ID" },
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  },
};

let prismaMock = createPrismaMock();

beforeEach(() => {
  prismaMock = createPrismaMock();
});

describe("createProfileRoutes", () => {
  it("exposes health, get profile, and patch profile", async () => {
    prismaMock.user.upsert = createMockFn(async () => ({ id: "user-1", firebaseUid: "fb" }));
    prismaMock.user.findUnique = createMockFn(async () => sampleUser);

    const { routes } = createProfileModule(prismaMock as never);
    const app = await buildTestApp(routes, { user: { uid: "fb", email: "traveler@example.com" } });

    const health = await injectJson(app, "GET", "/health");
    assert.equal(health.statusCode, 200);
    assert.equal(health.json().data.module, "profile");

    const getRes = await injectJson(app, "GET", "/");
    assert.equal(getRes.statusCode, 200);
    const profile = getRes.json().data.profile;
    assert.equal(profile.email, "traveler@example.com");
    assert.equal(profile.displayName, "Agus");
    assert.equal(profile.preferences.dietary[0], "halal");
    assert.equal(profile.preferences.extra.passportCountry, "ID");

    prismaMock.user.update = createMockFn(async () => ({
      ...sampleUser,
      displayName: "Agus T.",
      homeCurrency: "USD",
      preference: {
        ...sampleUser.preference,
        budgetStyle: "luxury",
      },
    }));

    const patchRes = await injectJson(app, "PATCH", "/", {
      body: {
        displayName: "Agus T.",
        homeCurrency: "USD",
        preferences: { budgetStyle: "luxury" },
      },
    });
    assert.equal(patchRes.statusCode, 200);
    assert.equal(patchRes.json().data.profile.displayName, "Agus T.");
    assert.equal(patchRes.json().data.profile.homeCurrency, "USD");
    assert.equal(patchRes.json().data.profile.preferences.budgetStyle, "luxury");

    const invalid = await injectJson(app, "PATCH", "/", { body: {} });
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.json().error.code, "VALIDATION_ERROR");

    await app.close();

    const unauth = await buildTestApp(routes);
    const denied = await injectJson(unauth, "GET", "/");
    assert.equal(denied.statusCode, 401);
    await unauth.close();
  });
});
