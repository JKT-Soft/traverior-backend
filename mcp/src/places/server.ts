import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  errorResult,
  importApi,
  jsonResult,
  type ImportApi,
} from "../shared/runtime.js";

type ApiEnv = { loadEnv: () => unknown };
type PlaceModule = {
  createPlaceModule: (env: unknown) => {
    service: {
      search: (q: { textQuery: string; maxResultCount?: number }) => Promise<unknown>;
      searchRestaurants: (city: string, dietary?: string[]) => Promise<unknown>;
      searchPois: (city: string) => Promise<unknown>;
      providerName: string;
    };
  };
};

export async function registerPlacesTools(
  server: McpServer,
  load: ImportApi = importApi,
): Promise<void> {
  const envMod = await load<ApiEnv>("config/env.ts");
  const placeMod = await load<PlaceModule>("modules/places/index.ts");
  const { service } = placeMod.createPlaceModule(envMod.loadEnv());

  server.tool(
    "search_restaurants",
    "Search restaurants / food places in a city",
    {
      city: z.string(),
      dietary: z.array(z.string()).optional(),
    },
    async ({ city, dietary }) => {
      try {
        const places = await service.searchRestaurants(city, dietary);
        return jsonResult({ provider: service.providerName, places });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "search_pois",
    "Search points of interest / attractions in a city",
    { city: z.string() },
    async ({ city }) => {
      try {
        const places = await service.searchPois(city);
        return jsonResult({ provider: service.providerName, places });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "search_places",
    "Generic Places text search",
    {
      textQuery: z.string(),
      maxResultCount: z.number().int().positive().optional(),
    },
    async (args) => {
      try {
        const places = await service.search(args);
        return jsonResult({ provider: service.providerName, places });
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
