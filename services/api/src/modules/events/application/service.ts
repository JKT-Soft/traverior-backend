import type { EventProvider, EventSearchQuery } from "../domain/ports.js";

export class EventService {
  constructor(private readonly provider: EventProvider) {}
  search(query: EventSearchQuery) {
    return this.provider.searchEvents(query);
  }
  get providerName() {
    return this.provider.name;
  }
}
