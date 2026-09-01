import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  errorResult,
  importApi,
  jsonResult,
  type ImportApi,
} from "../shared/runtime.js";

type ApiEnv = { loadEnv: () => unknown };
type VisaModule = {
  createVisaModule: (env: unknown) => {
    service: {
      getRequirements: (q: {
        passportCountry: string;
        destinationCountry: string;
        travelDate?: string;
      }) => Promise<unknown>;
      providerName: string;
    };
  };
};

export async function registerVisaTools(
  server: McpServer,
  load: ImportApi = importApi,
): Promise<void> {
  const envMod = await load<ApiEnv>("config/env.ts");
  const visaMod = await load<VisaModule>("modules/visa/index.ts");
  const { service } = visaMod.createVisaModule(envMod.loadEnv());

  server.tool(
    "get_visa_requirements",
    "Get visa / document requirements for a passport → destination pair",
    {
      passportCountry: z.string().min(2),
      destinationCountry: z.string().min(2),
      travelDate: z.string().optional(),
    },
    async (args) => {
      try {
        const requirements = await service.getRequirements(args);
        return jsonResult({ provider: service.providerName, requirements });
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
