import type { RouteProvider, RouteQuery } from "../domain/ports.js";

export class RouteService {
  constructor(private readonly provider: RouteProvider) {}
  getRoute(query: RouteQuery) {
    return this.provider.getRoute(query);
  }
  get providerName() {
    return this.provider.name;
  }
}
