import { runMcpServer } from "../shared/runtime.js";
import { registerFlightsTools } from "./server.js";

await runMcpServer("mcp-flights", registerFlightsTools);
