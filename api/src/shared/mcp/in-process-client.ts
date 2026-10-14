import { AppError } from "../http/errors.js";
import { parseMcpToolPayload } from "./parse-result.js";
import { TOOL_SERVER } from "./tool-registry.js";
import type { McpDomainServices, McpToolClient, McpToolDescriptor, McpToolResult } from "./types.js";

/** Calls domain services directly with the same tool names/args as MCP servers. */
export class InProcessMcpClient implements McpToolClient {
  readonly name = "inprocess";

  constructor(private readonly services: McpDomainServices) {}

  listTools(): Promise<McpToolDescriptor[]> {
    return Promise.resolve(
      Object.entries(TOOL_SERVER).map(([name, server]) => ({
        name,
        server,
      })),
    );
  }

  async callTool(tool: string, args: Record<string, unknown>): Promise<McpToolResult> {
    try {
      const payload = await this.dispatch(tool, args);
      return parseMcpToolPayload(tool, {
        content: [{ type: "text", text: JSON.stringify({ ok: true, data: payload.data, fetchedAt: new Date().toISOString() }) }],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return parseMcpToolPayload(tool, {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ ok: false, error: message }) }],
      });
    }
  }

  private async dispatch(tool: string, args: Record<string, unknown>) {
    switch (tool) {
      case "search_flights": {
        const s = this.services.flights;
        const offers = await s.search({
          origin: String(args.origin),
          destination: String(args.destination),
          departureDate: String(args.departureDate),
          returnDate: args.returnDate ? String(args.returnDate) : undefined,
          adults: typeof args.adults === "number" ? args.adults : undefined,
        });
        return { data: { provider: s.providerName, offers } };
      }
      case "get_offer": {
        const s = this.services.flights;
        if (!s.getOffer) throw new AppError(400, "get_offer not supported", "MCP_TOOL_ERROR");
        const offer = await s.getOffer(String(args.offerId));
        return { data: { provider: s.providerName, offer } };
      }
      case "search_hotels": {
        const s = this.services.hotels;
        const hotels = await s.search({
          cityName: String(args.cityName),
          countryCode: args.countryCode ? String(args.countryCode) : undefined,
          checkIn: String(args.checkIn),
          checkOut: String(args.checkOut),
          adults: typeof args.adults === "number" ? args.adults : undefined,
        });
        return { data: { provider: s.providerName, hotels } };
      }
      case "search_restaurants": {
        const s = this.services.places;
        const places = await s.searchRestaurants(
          String(args.city),
          Array.isArray(args.dietary) ? (args.dietary as string[]) : undefined,
        );
        return { data: { provider: s.providerName, places } };
      }
      case "search_pois": {
        const s = this.services.places;
        const places = await s.searchPois(String(args.city));
        return { data: { provider: s.providerName, places } };
      }
      case "search_places": {
        const s = this.services.places;
        const places = await s.search({
          textQuery: String(args.textQuery),
          maxResultCount:
            typeof args.maxResultCount === "number" ? args.maxResultCount : undefined,
        });
        return { data: { provider: s.providerName, places } };
      }
      case "get_route": {
        const s = this.services.routes;
        const route = await s.getRoute({
          originLat: Number(args.originLat),
          originLng: Number(args.originLng),
          destinationLat: Number(args.destinationLat),
          destinationLng: Number(args.destinationLng),
          mode: args.mode as "DRIVE" | "WALK" | "BICYCLE" | "TRANSIT" | undefined,
        });
        return { data: { provider: s.providerName, route } };
      }
      case "get_forecast": {
        const s = this.services.weather;
        const forecast = await s.getForecast({
          lat: Number(args.lat),
          lon: Number(args.lon),
        });
        return { data: { provider: s.providerName, forecast } };
      }
      case "get_weather_alerts": {
        const s = this.services.weather;
        const forecast = (await s.getForecast({
          lat: Number(args.lat),
          lon: Number(args.lon),
        })) as { alerts?: unknown[] };
        return { data: { provider: s.providerName, alerts: forecast.alerts ?? [] } };
      }
      case "search_events": {
        const s = this.services.events;
        const events = await s.search({
          city: String(args.city),
          startDate: args.startDate ? String(args.startDate) : undefined,
          endDate: args.endDate ? String(args.endDate) : undefined,
          includeFree: args.includeFree !== false,
          includePaid: args.includePaid !== false,
        });
        return { data: { provider: s.providerName, events } };
      }
      case "search_tours": {
        const s = this.services.events;
        const events = await s.search({
          city: String(args.city),
          startDate: args.startDate ? String(args.startDate) : undefined,
          endDate: args.endDate ? String(args.endDate) : undefined,
          includeFree: false,
          includePaid: true,
        });
        return { data: { provider: s.providerName, events } };
      }
      case "get_visa_requirements": {
        const s = this.services.visa;
        const requirements = await s.getRequirements({
          passportCountry: String(args.passportCountry),
          destinationCountry: String(args.destinationCountry),
          travelDate: args.travelDate ? String(args.travelDate) : undefined,
        });
        return { data: { provider: s.providerName, requirements } };
      }
      case "generate_checklist": {
        const s = this.services.checklist;
        const checklist = await s.generate({
          destination: String(args.destination),
          countryCode: args.countryCode ? String(args.countryCode) : undefined,
          passportCountry: args.passportCountry ? String(args.passportCountry) : undefined,
          visaDocuments: Array.isArray(args.visaDocuments)
            ? (args.visaDocuments as string[])
            : undefined,
        });
        return {
          data: {
            provider: s.providerName,
            checklist,
            tips: checklist.tips,
          },
        };
      }
      default:
        throw new AppError(400, `Unknown MCP tool: ${tool}`, "MCP_TOOL_ERROR");
    }
  }
}
