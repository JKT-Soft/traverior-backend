import { runMcpServer } from "../shared/runtime.js";
import { registerEventsTools } from "./server.js";

await runMcpServer("mcp-events", registerEventsTools);
