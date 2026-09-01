import { runMcpServer } from "../shared/runtime.js";
import { registerPlacesTools } from "./server.js";

await runMcpServer("mcp-places", registerPlacesTools);
