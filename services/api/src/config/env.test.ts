import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadEnv } from "./env.js";
import { baseEnv } from "../test/helpers.js";

describe("loadEnv", () => {
  it("loads defaults", () => {
    const env = loadEnv(baseEnv());
    assert.equal(env.port, 3000);
    assert.equal(env.authMode, "dev");
    assert.equal(env.providers.flights, "mock");
    assert.equal(env.providers.visa, "static");
  });

  it("uses default database url when missing", () => {
    const { DATABASE_URL: _, ...rest } = baseEnv();
    const env = loadEnv(rest);
    assert.match(env.databaseUrl, /postgresql:\/\//);
  });

  it("rejects invalid AUTH_MODE", () => {
    assert.throws(() => loadEnv(baseEnv({ AUTH_MODE: "ldap" })), /AUTH_MODE/);
  });

  it("accepts firebase auth mode and secrets", () => {
    const env = loadEnv(
      baseEnv({
        AUTH_MODE: "firebase",
        FIREBASE_PROJECT_ID: "p1",
        OPENAI_API_KEY: "sk",
        DUFFEL_ACCESS_TOKEN: "d",
        LITEAPI_KEY: "l",
        GOOGLE_MAPS_API_KEY: "g",
        OPENWEATHER_API_KEY: "o",
        EVENTBRITE_TOKEN: "e",
        VIATOR_API_KEY: "v",
        SHERPA_API_KEY: "s",
        EXCHANGERATE_API_KEY: "x",
        PROVIDER_FLIGHTS: "duffel",
      }),
    );
    assert.equal(env.authMode, "firebase");
    assert.equal(env.firebaseProjectId, "p1");
    assert.equal(env.secrets.duffelAccessToken, "d");
    assert.equal(env.providers.flights, "duffel");
  });

  it("hits every default branch with empty source", () => {
    const env = loadEnv({});
    assert.equal(env.port, 3000);
    assert.equal(env.nodeEnv, "development");
    assert.equal(env.authMode, "dev");
    assert.equal(env.logDir, "logs");
    assert.equal(env.logLevel, "info");
    assert.match(env.databaseUrl, /traverior/);
    assert.equal(env.providers.flights, "mock");
    assert.equal(env.providers.visa, "static");
  });
});
