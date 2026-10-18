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

  it("requires FIREBASE_PROJECT_ID in firebase mode", () => {
    assert.throws(
      () => loadEnv(baseEnv({ AUTH_MODE: "firebase" })),
      /FIREBASE_PROJECT_ID/,
    );
  });

  it("accepts firebase auth mode and secrets", () => {
    const env = loadEnv(
      baseEnv({
        AUTH_MODE: "firebase",
        FIREBASE_PROJECT_ID: "p1",
        OPENAI_API_KEY: "sk",
        DUFFEL_ACCESS_TOKEN: "d",
        TRAVELPAYOUTS_TOKEN: "tp",
        TRAVELPAYOUTS_MARKER: "m1",
        TRAVELPAYOUTS_CURRENCY: "idr",
        TRAVELPAYOUTS_MARKET: "id",
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
    assert.equal(env.firebaseWebApiKey, undefined);
    assert.equal(env.authTestLogin.enabled, true);
    assert.equal(env.secrets.duffelAccessToken, "d");
    assert.equal(env.secrets.travelpayoutsToken, "tp");
    assert.equal(env.secrets.travelpayoutsMarker, "m1");
    assert.equal(env.secrets.travelpayoutsCurrency, "idr");
    assert.equal(env.secrets.travelpayoutsMarket, "id");
    assert.equal(env.providers.flights, "duffel");
  });

  it("hits every default branch with empty source", () => {
    const env = loadEnv({});
    assert.equal(env.port, 3000);
    assert.equal(env.nodeEnv, "development");
    assert.equal(env.authMode, "dev");
    assert.equal(env.logDir, "logs");
    assert.equal(env.logLevel, "info");
    assert.equal(env.cache.enabled, true);
    assert.equal(env.cache.ttl.flights, 900);
    assert.equal(env.cache.ttl.places, 86_400);
    assert.match(env.databaseUrl, /traverior/);
    assert.equal(env.providers.flights, "mock");
    assert.equal(env.providers.visa, "static");
    assert.equal(env.providers.images, "mock");
    assert.equal(env.cache.ttl.images, 604_800);
  });

  it("parses cache env overrides", () => {
    const env = loadEnv(
      baseEnv({
        CACHE_ENABLED: "false",
        REDIS_URL: "redis://localhost:6379",
        CACHE_TTL_FLIGHTS: "120",
        CACHE_TTL_WEATHER: "not-a-number",
        CACHE_TTL_IMAGES: "3600",
        PROVIDER_IMAGES: "unsplash",
        UNSPLASH_ACCESS_KEY: "u",
      }),
    );
    assert.equal(env.cache.enabled, false);
    assert.equal(env.cache.redisUrl, "redis://localhost:6379");
    assert.equal(env.cache.ttl.flights, 120);
    assert.equal(env.cache.ttl.weather, 1_800);
    assert.equal(env.cache.ttl.images, 3600);
    assert.equal(env.providers.images, "unsplash");
    assert.equal(env.secrets.unsplashAccessKey, "u");
  });

  it("selects llm provider from env", () => {
    const withKey = loadEnv(baseEnv({ OPENAI_API_KEY: "sk-test" }));
    assert.equal(withKey.llm.provider, "openai");
    assert.equal(withKey.llm.model, "gpt-4o-mini");

    const forced = loadEnv(
      baseEnv({ OPENAI_API_KEY: "sk-test", LLM_PROVIDER: "heuristic", OPENAI_MODEL: "gpt-4.1-mini" }),
    );
    assert.equal(forced.llm.provider, "heuristic");
    assert.equal(forced.llm.model, "gpt-4.1-mini");

    const noKey = loadEnv(baseEnv({ OPENAI_API_KEY: "" }));
    assert.equal(noKey.llm.provider, "heuristic");
  });

  it("parses firebase test-login settings", () => {
    const enabled = loadEnv(
      baseEnv({
        FIREBASE_WEB_API_KEY: "web-key",
        FIREBASE_TEST_EMAIL: "tester@example.com",
        FIREBASE_TEST_PASSWORD: "secret",
      }),
    );
    assert.equal(enabled.firebaseWebApiKey, "web-key");
    assert.equal(enabled.authTestLogin.enabled, true);
    assert.equal(enabled.authTestLogin.email, "tester@example.com");
    assert.equal(enabled.authTestLogin.password, "secret");

    const blank = loadEnv(baseEnv({ FIREBASE_WEB_API_KEY: "  ", FIREBASE_TEST_EMAIL: "  " }));
    assert.equal(blank.firebaseWebApiKey, undefined);
    assert.equal(blank.authTestLogin.email, undefined);

    const disabled = loadEnv(baseEnv({ AUTH_TEST_LOGIN: "false" }));
    assert.equal(disabled.authTestLogin.enabled, false);

    const production = loadEnv(baseEnv({ NODE_ENV: "production", AUTH_TEST_LOGIN: "true" }));
    assert.equal(production.authTestLogin.enabled, false);
  });

  it("parses swagger basic auth credentials", () => {
    assert.equal(loadEnv(baseEnv()).swaggerBasicAuth, undefined);

    const enabled = loadEnv(
      baseEnv({
        SWAGGER_BASIC_USER: " traverior ",
        SWAGGER_BASIC_PASSWORD: "docs-secret",
      }),
    );
    assert.deepEqual(enabled.swaggerBasicAuth, {
      username: "traverior",
      password: "docs-secret",
    });

    const incomplete = loadEnv(baseEnv({ SWAGGER_BASIC_USER: "traverior", SWAGGER_BASIC_PASSWORD: "" }));
    assert.equal(incomplete.swaggerBasicAuth, undefined);
  });

  it("parses mcp mode", () => {
    assert.equal(loadEnv(baseEnv({ MCP_MODE: "stdio" })).mcp.mode, "stdio");
    assert.equal(loadEnv(baseEnv({})).mcp.mode, "inprocess");
  });

  it("uses inprocess mcp in production when stdio is requested", () => {
    const env = loadEnv(baseEnv({ MCP_MODE: "stdio", NODE_ENV: "production" }));
    assert.equal(env.mcp.mode, "inprocess");
  });

  it("allows stdio mcp in production when explicitly enabled", () => {
    const env = loadEnv(
      baseEnv({
        MCP_MODE: "stdio",
        NODE_ENV: "production",
        MCP_ALLOW_STDIO_IN_PRODUCTION: "true",
      }),
    );
    assert.equal(env.mcp.mode, "stdio");
  });
});
