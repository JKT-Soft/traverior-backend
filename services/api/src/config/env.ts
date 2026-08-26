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
  providers: {
    flights: string;
    hotels: string;
    places: string;
    routes: string;
    weather: string;
    events: string;
    visa: string;
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

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const authMode = (source.AUTH_MODE ?? "dev") as Env["authMode"];
  if (authMode !== "dev" && authMode !== "firebase") {
    throw new Error(`Invalid AUTH_MODE: ${authMode}`);
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
      },
    },
    firebaseProjectId: source.FIREBASE_PROJECT_ID,
    openaiApiKey,
    llm: {
      provider: llmProvider,
      model: source.OPENAI_MODEL ?? "gpt-4o-mini",
      baseUrl: source.OPENAI_BASE_URL,
    },
    providers: {
      flights: source.PROVIDER_FLIGHTS ?? "mock",
      hotels: source.PROVIDER_HOTELS ?? "mock",
      places: source.PROVIDER_PLACES ?? "mock",
      routes: source.PROVIDER_ROUTES ?? "mock",
      weather: source.PROVIDER_WEATHER ?? "mock",
      events: source.PROVIDER_EVENTS ?? "mock",
      visa: source.PROVIDER_VISA ?? "static",
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
    },
  };
}
