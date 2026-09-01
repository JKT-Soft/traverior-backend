import type { McpServerId } from "./types.js";

/** Maps MCP tool name → domain server process (stdio) or module (in-process). */
export const TOOL_SERVER: Record<string, McpServerId> = {
  search_flights: "flights",
  get_offer: "flights",
  search_hotels: "hotels",
  search_restaurants: "places",
  search_pois: "places",
  search_places: "places",
  get_route: "routes",
  get_forecast: "weather",
  get_weather_alerts: "weather",
  search_events: "events",
  search_tours: "events",
  get_visa_requirements: "visa",
  generate_checklist: "checklist",
};

export const MCP_SERVER_SCRIPTS: Record<McpServerId, string> = {
  flights: "src/flights/main.ts",
  hotels: "src/hotels/main.ts",
  places: "src/places/main.ts",
  routes: "src/routes/main.ts",
  weather: "src/weather/main.ts",
  events: "src/events/main.ts",
  visa: "src/visa/main.ts",
  checklist: "src/checklist/main.ts",
};

export function serverForTool(tool: string): McpServerId {
  const server = TOOL_SERVER[tool];
  if (!server) throw new Error(`Unknown MCP tool: ${tool}`);
  return server;
}
