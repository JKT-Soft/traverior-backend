import { runMcpServer } from "../shared/runtime.js";
import { registerHotelsTools } from "./server.js";

await runMcpServer("mcp-hotels", registerHotelsTools);
