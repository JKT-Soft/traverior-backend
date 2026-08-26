import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  errorResult,
  importApi,
  jsonResult,
  type ImportApi,
} from "../shared/runtime.js";

type ApiEnv = { loadEnv: () => unknown };
type EventModule = {
  createEventModule: (env: unknown) => {
    service: {
      search: (q: {
        city: string;
        startDate?: string;
        endDate?: string;
        includeFree?: boolean;
        includePaid?: boolean;
      }) => Promise<unknown>;
      providerName: string;
    };
  };
};

export async function registerEventsTools(
  server: McpServer,
  load: ImportApi = importApi,
): Promise<void> {
  const envMod = await load<ApiEnv>("config/env.ts");
  const eventMod = await load<EventModule>("modules/events/index.ts");
  const { service } = eventMod.createEventModule(envMod.loadEnv());

  server.tool(
    "search_events",
    "Search free and/or paid events in a city (Eventbrite-oriented)",
    {
      city: z.string(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      includeFree: z.boolean().optional(),
      includePaid: z.boolean().optional(),
    },
    async (args) => {
      try {
        const events = await service.search(args);
        return jsonResult({ provider: service.providerName, events });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "search_tours",
    "Search paid tours/activities (Viator-oriented)",
    {
      city: z.string(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    },
    async (args) => {
      try {
        const events = await service.search({
          ...args,
          includeFree: false,
          includePaid: true,
        });
        return jsonResult({ provider: service.providerName, events });
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
