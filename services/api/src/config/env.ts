export type Env = {
  port: number;
  nodeEnv: string;
  authMode: "dev" | "firebase";
  databaseUrl: string;
  logDir: string;
  logLevel: string;
  firebaseProjectId?: string;
  openaiApiKey?: string;
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

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const authMode = (source.AUTH_MODE ?? "dev") as Env["authMode"];
  if (authMode !== "dev" && authMode !== "firebase") {
    throw new Error(`Invalid AUTH_MODE: ${authMode}`);
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
    firebaseProjectId: source.FIREBASE_PROJECT_ID,
    openaiApiKey: source.OPENAI_API_KEY,
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
