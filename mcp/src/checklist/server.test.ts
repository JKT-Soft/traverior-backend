import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFakeMcpServer, parseToolPayload } from "../test/helpers.js";
import { registerChecklistTools } from "./server.js";

describe("registerChecklistTools", () => {
  it("generate_checklist success and error", async () => {
    const fake = createFakeMcpServer();
    let fail = false;
    await registerChecklistTools(fake.server, async () => ({
      createChecklistModule: () => ({
        service: {
          providerName: "internal",
          generate: async (q: { destination: string }) => {
            if (fail) throw new Error("checklist");
            return { items: [{ destination: q.destination }] };
          },
        },
      }),
    }));

    assert.equal(
      parseToolPayload(
        (await fake.call("generate_checklist", { destination: "Osaka" })) as never,
      ).ok,
      true,
    );

    fail = true;
    assert.equal(
      parseToolPayload(
        (await fake.call("generate_checklist", { destination: "Osaka" })) as never,
      ).ok,
      false,
    );
  });
});
