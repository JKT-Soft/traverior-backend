import { runMcpServer } from "../shared/runtime.js";
import { registerChecklistTools } from "./server.js";

await runMcpServer("mcp-checklist", registerChecklistTools);
