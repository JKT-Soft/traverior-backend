import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  errorResult,
  importApi,
  jsonResult,
  type ImportApi,
} from "../shared/runtime.js";

type ApiEnv = { loadEnv: () => unknown };
type RouteModule = {
  createRouteModule: (env: unknown) => {
    service: {
      getRoute: (q: {
        originLat: number;
        originLng: number;
        destinationLat: number;
        destinationLng: number;
        mode?: "DRIVE" | "WALK" | "BICYCLE" | "TRANSIT";
      }) => Promise<unknown>;
      providerName: string;
    };
  };
};

export async function registerRoutesTools(
  server: McpServer,
  load: ImportApi = importApi,
): Promise<void> {
  const envMod = await load<ApiEnv>("config/env.ts");
  const routeMod = await load<RouteModule>("modules/routes/index.ts");
  const { service } = routeMod.createRouteModule(envMod.loadEnv());

  server.tool(
    "get_route",
    "Compute duration/distance between two coordinates",
    {
      originLat: z.number(),
      originLng: z.number(),
      destinationLat: z.number(),
      destinationLng: z.number(),
      mode: z.enum(["DRIVE", "WALK", "BICYCLE", "TRANSIT"]).optional(),
    },
    async (args) => {
      try {
        const route = await service.getRoute(args);
        return jsonResult({ provider: service.providerName, route });
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
