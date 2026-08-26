import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  errorResult,
  importApi,
  jsonResult,
  type ImportApi,
} from "../shared/runtime.js";

type ApiEnv = {
  loadEnv: () => unknown;
};

type FlightModule = {
  createFlightModule: (env: unknown) => {
    service: {
      search: (q: {
        origin: string;
        destination: string;
        departureDate: string;
        returnDate?: string;
        adults?: number;
        cabinClass?: "economy" | "premium_economy" | "business" | "first";
      }) => Promise<unknown>;
      getOffer: (id: string) => Promise<unknown>;
      providerName: string;
    };
  };
};

export async function registerFlightsTools(
  server: McpServer,
  load: ImportApi = importApi,
): Promise<void> {
  const envMod = await load<ApiEnv>("config/env.ts");
  const flightMod = await load<FlightModule>("modules/flights/index.ts");
  const { service } = flightMod.createFlightModule(envMod.loadEnv());

  server.tool(
    "search_flights",
    "Search flight offers between airports (IATA). Prices come from the configured flight provider.",
    {
      origin: z.string().length(3).describe("Origin IATA, e.g. CGK"),
      destination: z.string().length(3).describe("Destination IATA, e.g. KIX"),
      departureDate: z.string().describe("YYYY-MM-DD"),
      returnDate: z.string().optional().describe("YYYY-MM-DD optional return"),
      adults: z.number().int().positive().optional(),
      cabinClass: z
        .enum(["economy", "premium_economy", "business", "first"])
        .optional(),
    },
    async (args) => {
      try {
        const offers = await service.search(args);
        return jsonResult({ provider: service.providerName, offers });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "get_offer",
    "Get a single flight offer by provider offer id",
    { offerId: z.string() },
    async ({ offerId }) => {
      try {
        const offer = await service.getOffer(offerId);
        return jsonResult({ provider: service.providerName, offer });
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
