import type { Money, ProviderMeta } from "../../../shared/types/provider.js";

export type EventSearchQuery = {
  city: string;
  startDate?: string;
  endDate?: string;
  includeFree?: boolean;
  includePaid?: boolean;
};

export type EventResult = ProviderMeta & {
  contentType: "event";
  name: string;
  isFree: boolean;
  price: Money;
  startsAt?: string;
  source: "eventbrite" | "viator" | "mock";
  externalId: string;
  thumbnailUrl?: string | null;
};

export interface EventProvider {
  readonly name: string;
  searchEvents(query: EventSearchQuery): Promise<EventResult[]>;
  searchTours?(query: EventSearchQuery): Promise<EventResult[]>;
}
