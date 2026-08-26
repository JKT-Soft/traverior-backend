import type { EventProvider, EventResult, EventSearchQuery } from "../domain/ports.js";

export class MockEventProvider implements EventProvider {
  readonly name = "mock";

  async searchEvents(query: EventSearchQuery): Promise<EventResult[]> {
    const includeFree = query.includeFree ?? true;
    const includePaid = query.includePaid ?? true;
    const items: EventResult[] = [];
    if (includeFree) {
      items.push({
        contentType: "event",
        provider: this.name,
        providerRef: "mock-free-1",
        fetchedAt: new Date().toISOString(),
        deepLinkUrl: "https://example.com/events/free",
        name: `${query.city} Free Festival`,
        isFree: true,
        price: { amount: 0, currency: "IDR", isEstimate: false },
        source: "mock",
        externalId: "mock-free-1",
      });
    }
    if (includePaid) {
      items.push({
        contentType: "event",
        provider: this.name,
        providerRef: "mock-paid-1",
        fetchedAt: new Date().toISOString(),
        deepLinkUrl: "https://example.com/tours/paid",
        name: `${query.city} City Tour`,
        isFree: false,
        price: { amount: 350000, currency: "IDR", isEstimate: true },
        source: "mock",
        externalId: "mock-paid-1",
      });
    }
    return items;
  }

  searchTours(query: EventSearchQuery) {
    return this.searchEvents({ ...query, includeFree: false, includePaid: true });
  }
}
