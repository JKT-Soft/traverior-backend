import { runMcpServer } from "../shared/runtime.js";
import { registerWeatherTools } from "./server.js";

await runMcpServer("mcp-weather", registerWeatherTools);
