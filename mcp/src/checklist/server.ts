import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  errorResult,
  importApi,
  jsonResult,
  type ImportApi,
} from "../shared/runtime.js";

type ChecklistModule = {
  createChecklistModule: () => {
    service: {
      generate: (q: {
        destination: string;
        passportCountry?: string;
        visaDocuments?: string[];
      }) => Promise<unknown>;
      providerName: string;
    };
  };
};

export async function registerChecklistTools(
  server: McpServer,
  load: ImportApi = importApi,
): Promise<void> {
  const checklistMod = await load<ChecklistModule>("modules/checklist/index.ts");
  const { service } = checklistMod.createChecklistModule();

  server.tool(
    "generate_checklist",
    "Generate packing / preparation checklist for a destination",
    {
      destination: z.string(),
      passportCountry: z.string().optional(),
      visaDocuments: z.array(z.string()).optional(),
    },
    async (args) => {
      try {
        const checklist = await service.generate(args);
        const tips =
          checklist &&
          typeof checklist === "object" &&
          "tips" in checklist &&
          Array.isArray((checklist as { tips?: unknown }).tips)
            ? (checklist as { tips: unknown[] }).tips
            : undefined;
        return jsonResult({
          provider: service.providerName,
          checklist,
          ...(tips ? { tips } : {}),
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
