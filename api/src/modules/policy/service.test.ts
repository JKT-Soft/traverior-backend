import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PolicyService } from "./service.js";

describe("PolicyService", () => {
  it("evaluates mutate rules", () => {
    const p = new PolicyService();
    assert.equal(
      p.canAiMutate({ isLocked: false, isCustom: false, suppressAiRestore: false, deletedAt: null }),
      true,
    );
    assert.equal(
      p.canAiMutate({ isLocked: true, isCustom: false, suppressAiRestore: false, deletedAt: null }),
      false,
    );
    assert.equal(
      p.canAiMutate({ isLocked: false, isCustom: true, suppressAiRestore: false, deletedAt: null }),
      false,
    );
    assert.equal(
      p.canAiMutate({ isLocked: false, isCustom: false, suppressAiRestore: true, deletedAt: null }),
      false,
    );
    assert.equal(
      p.canAiMutate({
        isLocked: false,
        isCustom: false,
        suppressAiRestore: false,
        deletedAt: new Date(),
      }),
      false,
    );
  });
});
