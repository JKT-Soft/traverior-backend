import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFakeMcpServer, parseToolPayload } from "../test/helpers.js";
import { registerVisaTools } from "./server.js";

describe("registerVisaTools", () => {
  it("get_visa_requirements success and error", async () => {
    const fake = createFakeMcpServer();
    let fail = false;
    await registerVisaTools(fake.server, async (rel) => {
      if (rel.includes("config/env")) return { loadEnv: () => ({}) };
      return {
        createVisaModule: () => ({
          service: {
            providerName: "static",
            getRequirements: async () => {
              if (fail) throw new Error("visa");
              return { documents: ["passport"] };
            },
          },
        }),
      };
    });

    assert.equal(
      parseToolPayload(
        (await fake.call("get_visa_requirements", {
          passportCountry: "ID",
          destinationCountry: "JP",
        })) as never,
      ).ok,
      true,
    );

    fail = true;
    assert.equal(
      parseToolPayload(
        (await fake.call("get_visa_requirements", {
          passportCountry: "ID",
          destinationCountry: "JP",
        })) as never,
      ).ok,
      false,
    );
  });
});
