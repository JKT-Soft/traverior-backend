export type Env = {
  port: number;
  nodeEnv: string;
  authMode: "dev" | "firebase";
  databaseUrl: string;
  logDir: string;
  logLevel: string;
  cache: {
    enabled: boolean;
    redisUrl?: string;
    ttl: {
      flights: number;
      hotels: number;
      places: number;
      routes: number;
      weather: number;
      events: number;
      visa: number;
      trips: number;
      images: number;
    };
  };
  firebaseProjectId?: string;
  openaiApiKey?: string;
  llm: {
    /** openai when key present (unless forced); heuristic for offline/dev */
    provider: "openai" | "heuristic";
    model: string;
    baseUrl?: string;
  };
  mcp: {
    /** inprocess = call domain services; stdio = spawn MCP server processes */
    mode: "inprocess" | "stdio";
    serversDir: string;
    runnerCommand?: string;
    runnerArgsPrefix?: string[];
  };
  providers: {
    flights: string;
    hotels: string;
    places: string;
    routes: string;
    weather: string;
    events: string;
    visa: string;
    images: string;
  };
  secrets: {
    duffelAccessToken?: string;
    liteApiKey?: string;
    googleMapsApiKey?: string;
    openWeatherApiKey?: string;
    eventbriteToken?: string;
    viatorApiKey?: string;
    sherpaApiKey?: string;
    exchangeRateApiKey?: string;
    unsplashAccessKey?: string;
  };
};

function intEnv(source: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = source[key];
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function boolEnv(source: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const raw = source[key];
  if (raw == null || raw === "") return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}

import path from "node:path";

function defaultMcpServersDir(): string {
  return path.resolve(process.cwd(), "../mcp");
}

function mcpMode(source: NodeJS.ProcessEnv): Env["mcp"]["mode"] {
  const raw = (source.MCP_MODE ?? "").toLowerCase();
  if (raw === "stdio" || raw === "inprocess") return raw;
  return "inprocess";
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const authMode = (source.AUTH_MODE ?? "dev") as Env["authMode"];
  if (authMode !== "dev" && authMode !== "firebase") {
    throw new Error(`Invalid AUTH_MODE: ${authMode}`);
  }
  if (authMode === "firebase" && !source.FIREBASE_PROJECT_ID?.trim()) {
    throw new Error("FIREBASE_PROJECT_ID is required when AUTH_MODE=firebase");
  }

  const openaiApiKey = source.OPENAI_API_KEY;
  const llmProviderRaw = (source.LLM_PROVIDER ?? "").toLowerCase();
  let llmProvider: Env["llm"]["provider"];
  if (llmProviderRaw === "openai" || llmProviderRaw === "heuristic") {
    llmProvider = llmProviderRaw;
  } else {
    llmProvider = openaiApiKey ? "openai" : "heuristic";
  }

  return {
    port: Number(source.PORT ?? 3000),
    nodeEnv: source.NODE_ENV ?? "development",
    authMode,
    databaseUrl:
      source.DATABASE_URL ??
      "postgresql://traverior:traverior@localhost:5432/traverior?schema=public",
    logDir: source.LOG_DIR ?? "logs",
    logLevel: source.LOG_LEVEL ?? "info",
    cache: {
      enabled: boolEnv(source, "CACHE_ENABLED", true),
      redisUrl: source.REDIS_URL,
      ttl: {
        flights: intEnv(source, "CACHE_TTL_FLIGHTS", 900),
        hotels: intEnv(source, "CACHE_TTL_HOTELS", 900),
        places: intEnv(source, "CACHE_TTL_PLACES", 86_400),
        routes: intEnv(source, "CACHE_TTL_ROUTES", 3_600),
        weather: intEnv(source, "CACHE_TTL_WEATHER", 1_800),
        events: intEnv(source, "CACHE_TTL_EVENTS", 1_800),
        visa: intEnv(source, "CACHE_TTL_VISA", 604_800),
        trips: intEnv(source, "CACHE_TTL_TRIPS", 60),
        images: intEnv(source, "CACHE_TTL_IMAGES", 604_800),
      },
    },
    firebaseProjectId: source.FIREBASE_PROJECT_ID?.trim() || undefined,
    openaiApiKey,
    llm: {
      provider: llmProvider,
      model: source.OPENAI_MODEL ?? "gpt-4o-mini",
      baseUrl: source.OPENAI_BASE_URL,
    },
    mcp: {
      mode: mcpMode(source),
      serversDir: source.MCP_SERVERS_DIR ?? defaultMcpServersDir(),
      runnerCommand: source.MCP_RUNNER_COMMAND,
      runnerArgsPrefix: source.MCP_RUNNER_ARGS
        ? source.MCP_RUNNER_ARGS.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined,
    },
    providers: {
      flights: source.PROVIDER_FLIGHTS ?? "mock",
      hotels: source.PROVIDER_HOTELS ?? "mock",
      places: source.PROVIDER_PLACES ?? "mock",
      routes: source.PROVIDER_ROUTES ?? "mock",
      weather: source.PROVIDER_WEATHER ?? "mock",
      events: source.PROVIDER_EVENTS ?? "mock",
      visa: source.PROVIDER_VISA ?? "static",
      images: source.PROVIDER_IMAGES ?? "mock",
    },
    secrets: {
      duffelAccessToken: source.DUFFEL_ACCESS_TOKEN,
      liteApiKey: source.LITEAPI_KEY,
      googleMapsApiKey: source.GOOGLE_MAPS_API_KEY,
      openWeatherApiKey: source.OPENWEATHER_API_KEY,
      eventbriteToken: source.EVENTBRITE_TOKEN,
      viatorApiKey: source.VIATOR_API_KEY,
      sherpaApiKey: source.SHERPA_API_KEY,
      exchangeRateApiKey: source.EXCHANGERATE_API_KEY,
      unsplashAccessKey: source.UNSPLASH_ACCESS_KEY,
    },
  };
}
