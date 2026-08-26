import { runMcpServer } from "../shared/runtime.js";
import { registerRoutesTools } from "./server.js";

await runMcpServer("mcp-routes", registerRoutesTools);
