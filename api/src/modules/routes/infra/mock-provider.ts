import type { RouteProvider, RouteQuery, RouteResult } from "../domain/ports.js";

export class MockRouteProvider implements RouteProvider {
  readonly name = "mock";

  async getRoute(query: RouteQuery): Promise<RouteResult> {
    return {
      contentType: "route",
      provider: this.name,
      fetchedAt: new Date().toISOString(),
      mode: query.mode ?? "TRANSIT",
      durationMinutes: 42,
      distanceMeters: 8500,
      stepsSummary: ["Walk", "Transit", "Walk"],
    };
  }
}
