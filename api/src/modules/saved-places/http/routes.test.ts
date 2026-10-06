import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { buildTestApp, createMockFn, injectJson, type MockFn } from "../../../test/helpers.js";
import { createSavedPlaceModule } from "../index.js";

const placeId = "11111111-1111-1111-1111-111111111111";

const samplePlace = {
  id: placeId,
  userId: "user-1",
  name: "Osaka Castle",
  address: "1-1 Osakajo",
  city: "Osaka",
  country: "Japan",
  lat: 34.6873,
  lng: 135.5262,
  source: "user",
  provider: "google",
  providerRef: "ChIJos",
  tripId: null,
  stopId: null,
  notes: null,
  extra: null,
  createdAt: new Date("2026-09-04T00:00:00.000Z"),
  updatedAt: new Date("2026-09-04T00:00:00.000Z"),
};

function createPrismaMock(): {
  user: { upsert: MockFn<(...args: never[]) => Promise<unknown>> };
  savedPlace: {
    findMany: MockFn<(...args: never[]) => Promise<unknown>>;
    findFirst: MockFn<(...args: never[]) => Promise<unknown>>;
    create: MockFn<(...args: never[]) => Promise<unknown>>;
    update: MockFn<(...args: never[]) => Promise<unknown>>;
    delete: MockFn<(...args: never[]) => Promise<unknown>>;
  };
  stop: { findFirst: MockFn<(...args: never[]) => Promise<unknown>> };
} {
  return {
    user: {
      upsert: createMockFn(async () => ({ id: "user-1", firebaseUid: "fb" })),
    },
    savedPlace: {
      findMany: createMockFn(async () => []),
      findFirst: createMockFn(async () => null),
      create: createMockFn(async () => samplePlace),
      update: createMockFn(async () => samplePlace),
      delete: createMockFn(async () => samplePlace),
    },
    stop: {
      findFirst: createMockFn(async () => null),
    },
  };
}

let prismaMock = createPrismaMock();

beforeEach(() => {
  prismaMock = createPrismaMock();
});

describe("createSavedPlaceRoutes", () => {
  it("lists, creates, updates, and deletes saved places", async () => {
    prismaMock.savedPlace.findMany = createMockFn(async () => [samplePlace]);
    prismaMock.savedPlace.findFirst = createMockFn(async () => samplePlace);
    prismaMock.savedPlace.create = createMockFn(async () => samplePlace);
    prismaMock.savedPlace.update = createMockFn(async () => ({
      ...samplePlace,
      notes: "Sunset",
    }));

    const { routes } = createSavedPlaceModule(prismaMock as never);
    const app = await buildTestApp(routes, { user: { uid: "fb", email: "traveler@example.com" } });

    const health = await injectJson(app, "GET", "/health");
    assert.equal(health.statusCode, 200);
    assert.equal(health.json().data.module, "saved-places");

    const list = await injectJson(app, "GET", "/");
    assert.equal(list.statusCode, 200);
    assert.equal(list.json().data.places[0].name, "Osaka Castle");

    prismaMock.savedPlace.findFirst = createMockFn(async () => null);
    const created = await injectJson(app, "POST", "/", {
      body: {
        name: "Osaka Castle",
        city: "Osaka",
        lat: 34.6873,
        lng: 135.5262,
        provider: "google",
        providerRef: "ChIJos",
      },
    });
    assert.equal(created.statusCode, 201);
    assert.equal(created.json().data.created, true);
    assert.equal(created.json().data.place.name, "Osaka Castle");

    prismaMock.savedPlace.findFirst = createMockFn(async () => samplePlace);
    const duplicate = await injectJson(app, "POST", "/", {
      body: {
        name: "Osaka Castle",
        provider: "google",
        providerRef: "ChIJos",
      },
    });
    assert.equal(duplicate.statusCode, 200);
    assert.equal(duplicate.json().data.created, false);

    const patched = await injectJson(app, "PATCH", `/${placeId}`, {
      body: { notes: "Sunset" },
    });
    assert.equal(patched.statusCode, 200);
    assert.equal(patched.json().data.place.notes, "Sunset");

    const got = await injectJson(app, "GET", `/${placeId}`);
    assert.equal(got.statusCode, 200);
    assert.equal(got.json().data.place.id, placeId);

    const removed = await injectJson(app, "DELETE", `/${placeId}`);
    assert.equal(removed.statusCode, 200);
    assert.equal(removed.json().data.deleted, true);

    const invalid = await injectJson(app, "POST", "/", { body: {} });
    assert.equal(invalid.statusCode, 400);

    await app.close();

    const unauth = await buildTestApp(routes);
    const denied = await injectJson(unauth, "GET", "/");
    assert.equal(denied.statusCode, 401);
    await unauth.close();
  });
});
