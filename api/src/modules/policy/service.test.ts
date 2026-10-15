import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PolicyService, type PipelinePolicyNode } from "./service.js";

const open: PipelinePolicyNode = {
  id: "n1",
  path: "trip/osaka",
  type: "CHECKPOINT",
  parentId: "root",
  origin: "ai",
  isLocked: false,
  isCustom: false,
  suppressAiRestore: false,
  deletedAt: null,
};

describe("PolicyService", () => {
  const policy = new PolicyService();

  it("evaluates mutate rules", () => {
    assert.equal(policy.canAiMutate(open), true);
    assert.equal(policy.canAiMutate({ ...open, isLocked: true }), false);
    assert.equal(policy.canAiMutate({ ...open, isCustom: true }), false);
    assert.equal(policy.canAiMutate({ ...open, suppressAiRestore: true }), false);
    assert.equal(policy.canAiMutate({ ...open, deletedAt: new Date() }), false);
    assert.equal(policy.canAiMutate({ ...open, origin: "user" }), false);
    assert.equal(policy.canAiMutate({ ...open, parentId: null, type: "JOURNEY" }), false);
  });

  it("keeps ancestors of a locked child and skips colliding drafts", () => {
    const root = {
      ...open,
      id: "root",
      path: "trip",
      type: "JOURNEY",
      parentId: null,
      origin: "user" as const,
    };
    const city = { ...open, id: "city", path: "trip/osaka", parentId: "root" };
    const hotel = {
      ...open,
      id: "hotel",
      path: "trip/osaka/search_hotels-1",
      type: "BOOKING",
      parentId: "city",
      isLocked: true,
    };
    const extra = {
      ...open,
      id: "poi",
      path: "trip/osaka/search_pois-1",
      type: "MODULE",
      parentId: "city",
    };

    const plan = policy.planReplacement([root, city, hotel, extra]);
    assert.deepEqual(
      plan.preserved.map((node) => node.id).sort(),
      ["city", "hotel"],
    );
    assert.deepEqual(
      plan.replaceable.map((node) => node.id),
      ["poi"],
    );

    const drafts = policy.filterDrafts(
      [
        { path: "trip/osaka" },
        { path: "trip/osaka/search_hotels-1" },
        { path: "trip/osaka/search_pois-1" },
        { path: "trip/kyoto" },
      ],
      plan.preserved,
    );
    assert.deepEqual(
      drafts.map((draft) => draft.path),
      ["trip/kyoto"],
    );
  });

  it("preserves top-level stop when parentId is null and node is locked", () => {
    const lockedStay: PipelinePolicyNode = {
      ...open,
      id: "stay_tokyo",
      path: "journey/stay_tokyo",
      kind: "stay",
      parentId: null,
      isLocked: true,
    };
    const openStay: PipelinePolicyNode = {
      ...open,
      id: "stay_kyoto",
      path: "journey/stay_kyoto",
      kind: "stay",
      parentId: null,
      isLocked: false,
    };

    const plan = policy.planReplacement([lockedStay, openStay]);
    assert.deepEqual(
      plan.preserved.map((node) => node.id),
      ["stay_tokyo"],
    );
    assert.deepEqual(
      plan.replaceable.map((node) => node.id),
      ["stay_kyoto"],
    );

    const drafts = policy.filterDrafts(
      [
        { path: "journey/stay_tokyo" },
        { path: "journey/stay_kyoto" },
        { path: "journey/stay_osaka" },
      ],
      plan.preserved,
    );
    assert.deepEqual(
      drafts.map((draft) => draft.path),
      ["journey/stay_kyoto", "journey/stay_osaka"],
    );
  });
});

