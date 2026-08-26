import { runMcpServer } from "../shared/runtime.js";
import { registerVisaTools } from "./server.js";

await runMcpServer("mcp-visa", registerVisaTools);
