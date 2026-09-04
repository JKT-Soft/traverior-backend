import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NotFoundError, ValidationError } from "../../../shared/http/errors.js";
import { createMockFn } from "../../../test/helpers.js";
import { SavedPlaceService, serializeSavedPlace } from "./service.js";

const samplePlace = {
  id: "11111111-1111-1111-1111-111111111111",
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
  nodeId: null,
  notes: null,
  extra: null,
  createdAt: new Date("2026-09-04T00:00:00.000Z"),
  updatedAt: new Date("2026-09-04T00:00:00.000Z"),
};

describe("SavedPlaceService", () => {
  it("serializes a saved place", () => {
    const serialized = serializeSavedPlace(samplePlace);
    assert.equal(serialized.name, "Osaka Castle");
    assert.equal(serialized.createdAt, "2026-09-04T00:00:00.000Z");
    assert.equal(serialized.providerRef, "ChIJos");
  });

  it("lists places for the user", async () => {
    const findMany = createMockFn(async () => [samplePlace]);
    const service = new SavedPlaceService({
      user: { upsert: createMockFn() },
      savedPlace: { findMany },
      pipelineNode: { findFirst: createMockFn() },
    } as never);

    const places = await service.listPlaces("user-1", { city: "Osaka" });
    assert.equal(places.length, 1);
    assert.equal(places[0]?.name, "Osaka Castle");
    const arg = findMany.mock.calls[0]?.[0] as { where: { userId: string; city: string } };
    assert.equal(arg.where.userId, "user-1");
    assert.equal(arg.where.city, "Osaka");
  });

  it("creates a place and returns created=true", async () => {
    const create = createMockFn(async () => samplePlace);
    const service = new SavedPlaceService({
      user: { upsert: createMockFn() },
      savedPlace: {
        findFirst: createMockFn(async () => null),
        create,
      },
      pipelineNode: { findFirst: createMockFn() },
    } as never);

    const result = await service.savePlace("user-1", {
      name: "Osaka Castle",
      city: "Osaka",
      lat: 34.68731,
      lng: 135.52619,
      provider: "google",
      providerRef: "ChIJos",
    });

    assert.equal(result.created, true);
    assert.equal(result.place.name, "Osaka Castle");
    const created = create.mock.calls[0]?.[0] as { data: { lat: number; lng: number } };
    assert.equal(created.data.lat, 34.68731);
    assert.equal(created.data.lng, 135.52619);
  });

  it("returns the existing place instead of duplicating", async () => {
    const create = createMockFn(async () => samplePlace);
    const service = new SavedPlaceService({
      user: { upsert: createMockFn() },
      savedPlace: {
        findFirst: createMockFn(async () => samplePlace),
        create,
      },
      pipelineNode: { findFirst: createMockFn() },
    } as never);

    const result = await service.savePlace("user-1", {
      name: "Osaka Castle",
      provider: "google",
      providerRef: "ChIJos",
    });

    assert.equal(result.created, false);
    assert.equal(result.place.id, samplePlace.id);
    assert.equal(create.mock.calls.length, 0);
  });

  it("saves from a trip node", async () => {
    const create = createMockFn(async (args: { data: { name: string; nodeId: string } }) => ({
      ...samplePlace,
      name: args.data.name,
      nodeId: args.data.nodeId,
      source: "node",
      provider: "pipeline",
      providerRef: args.data.nodeId,
    }));
    const service = new SavedPlaceService({
      user: { upsert: createMockFn() },
      savedPlace: {
        findFirst: createMockFn(async () => null),
        create,
      },
      pipelineNode: {
        findFirst: createMockFn(async () => ({
          id: "22222222-2222-2222-2222-222222222222",
          tripId: "trip-1",
          title: "Dotonbori",
          subtitle: "Namba",
          locationLabel: "Osaka",
          locationLat: 34.6687,
          locationLng: 135.503,
          provider: null,
          providerRef: null,
          content: { city: "Osaka" },
          deletedAt: null,
        })),
      },
    } as never);

    const result = await service.savePlace("user-1", {
      nodeId: "22222222-2222-2222-2222-222222222222",
    });

    assert.equal(result.created, true);
    assert.equal(result.place.name, "Dotonbori");
    assert.equal(result.place.nodeId, "22222222-2222-2222-2222-222222222222");
  });

  it("rejects save without a name or node", async () => {
    const service = new SavedPlaceService({
      user: { upsert: createMockFn() },
      savedPlace: { findFirst: createMockFn(), create: createMockFn() },
      pipelineNode: { findFirst: createMockFn() },
    } as never);

    await assert.rejects(
      () => service.savePlace("user-1", { city: "Osaka" }),
      (err: unknown) => err instanceof ValidationError,
    );
  });

  it("throws when a place is missing", async () => {
    const service = new SavedPlaceService({
      user: { upsert: createMockFn() },
      savedPlace: { findFirst: createMockFn(async () => null) },
      pipelineNode: { findFirst: createMockFn() },
    } as never);

    await assert.rejects(
      () => service.getPlace("user-1", samplePlace.id),
      (err: unknown) => err instanceof NotFoundError,
    );
  });

  it("updates notes and deletes a place", async () => {
    const update = createMockFn(async () => ({ ...samplePlace, notes: "Go at sunset" }));
    const del = createMockFn(async () => samplePlace);
    const service = new SavedPlaceService({
      user: { upsert: createMockFn() },
      savedPlace: {
        findFirst: createMockFn(async () => samplePlace),
        update,
        delete: del,
      },
      pipelineNode: { findFirst: createMockFn() },
    } as never);

    const updated = await service.updatePlace("user-1", samplePlace.id, { notes: "Go at sunset" });
    assert.equal(updated.notes, "Go at sunset");

    const deleted = await service.deletePlace("user-1", samplePlace.id);
    assert.equal(deleted.deleted, true);
    assert.equal(del.mock.calls.length, 1);
  });
});
