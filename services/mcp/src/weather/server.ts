import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  errorResult,
  importApi,
  jsonResult,
  type ImportApi,
} from "../shared/runtime.js";

type ApiEnv = { loadEnv: () => unknown };
type WeatherModule = {
  createWeatherModule: (env: unknown) => {
    service: {
      getForecast: (q: { lat: number; lon: number }) => Promise<unknown>;
      providerName: string;
    };
  };
};

export async function registerWeatherTools(
  server: McpServer,
  load: ImportApi = importApi,
): Promise<void> {
  const envMod = await load<ApiEnv>("config/env.ts");
  const weatherMod = await load<WeatherModule>("modules/weather/index.ts");
  const { service } = weatherMod.createWeatherModule(envMod.loadEnv());

  server.tool(
    "get_forecast",
    "Get weather forecast and alerts for lat/lon",
    { lat: z.number(), lon: z.number() },
    async (args) => {
      try {
        const forecast = await service.getForecast(args);
        return jsonResult({ provider: service.providerName, forecast });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "get_weather_alerts",
    "Get weather alerts only (uses same One Call forecast under the hood)",
    { lat: z.number(), lon: z.number() },
    async (args) => {
      try {
        const forecast = (await service.getForecast(args)) as {
          alerts?: unknown[];
        };
        return jsonResult({
          provider: service.providerName,
          alerts: forecast.alerts ?? [],
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
