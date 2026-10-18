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
        thumbnailUrl:
          "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=400&q=80",
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
        thumbnailUrl:
          "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=400&q=80",
      });
    }
    return items;
  }

  searchTours(query: EventSearchQuery) {
    return this.searchEvents({ ...query, includeFree: false, includePaid: true });
  }
}
