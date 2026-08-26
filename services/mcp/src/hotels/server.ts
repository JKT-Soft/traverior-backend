import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  errorResult,
  importApi,
  jsonResult,
  type ImportApi,
} from "../shared/runtime.js";

type ApiEnv = { loadEnv: () => unknown };
type HotelModule = {
  createHotelModule: (env: unknown) => {
    service: {
      search: (q: {
        cityName: string;
        countryCode?: string;
        checkIn: string;
        checkOut: string;
        adults?: number;
        currency?: string;
        guestNationality?: string;
      }) => Promise<unknown>;
      providerName: string;
    };
  };
};

export async function registerHotelsTools(
  server: McpServer,
  load: ImportApi = importApi,
): Promise<void> {
  const envMod = await load<ApiEnv>("config/env.ts");
  const hotelMod = await load<HotelModule>("modules/hotels/index.ts");
  const { service } = hotelMod.createHotelModule(envMod.loadEnv());

  server.tool(
    "search_hotels",
    "Search hotel rates for a city and stay dates",
    {
      cityName: z.string(),
      countryCode: z.string().optional(),
      checkIn: z.string(),
      checkOut: z.string(),
      adults: z.number().int().positive().optional(),
      currency: z.string().optional(),
      guestNationality: z.string().optional(),
    },
    async (args) => {
      try {
        const hotels = await service.search(args);
        return jsonResult({ provider: service.providerName, hotels });
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
