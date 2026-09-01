import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mockReq } from "../../../test/helpers.js";
import { DevAuthProvider } from "./dev-provider.js";

describe("DevAuthProvider", () => {
  it("parses tokens", async () => {
    const p = new DevAuthProvider();
    assert.equal(await p.resolve(mockReq()), undefined);
    assert.equal(await p.resolve(mockReq({ headers: { authorization: "Basic x" } })), undefined);
    assert.deepEqual(await p.resolve(mockReq({ headers: { authorization: "Bearer dev:abc" } })), {
      uid: "abc",
      email: "abc@dev.local",
    });
    assert.deepEqual(await p.resolve(mockReq({ headers: { authorization: "Bearer bare" } })), {
      uid: "bare",
      email: "bare@dev.local",
    });
  });
});
