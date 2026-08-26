import type { Env } from "../../../config/env.js";
import type { EventProvider, EventResult, EventSearchQuery } from "../domain/ports.js";
import { createEventbriteEventProvider, EventbriteEventProvider } from "./eventbrite-provider.js";
import { MockEventProvider } from "./mock-provider.js";

/**
 * Events provider: Eventbrite and/or Viator.
 * Pass only the token(s) you want enabled — omit Viator key to disable tours.
 */
export class CompositeEventProvider implements EventProvider {
  readonly name: string;
  private readonly eventbrite?: EventProvider;

  constructor(
    private readonly eventbriteToken?: string,
    private readonly viatorApiKey?: string,
    private readonly fallback: EventProvider = new MockEventProvider(),
    eventbrite?: EventProvider,
  ) {
    this.eventbrite =
      eventbrite ??
      (eventbriteToken ? new EventbriteEventProvider(eventbriteToken) : undefined);

    if (this.eventbrite && viatorApiKey) this.name = "eventbrite+viator";
    else if (this.eventbrite) this.name = "eventbrite";
    else if (viatorApiKey) this.name = "viator";
    else this.name = "eventbrite+viator";
  }

  async searchEvents(query: EventSearchQuery): Promise<EventResult[]> {
    const hasEventbrite = Boolean(this.eventbrite);
    const hasViator = Boolean(this.viatorApiKey);

    if (!hasEventbrite && !hasViator) {
      return this.fallback.searchEvents(query);
    }

    const results: EventResult[] = [];

    if (hasEventbrite && (query.includeFree !== false || query.includePaid !== false)) {
      results.push(...(await this.eventbrite!.searchEvents(query)));
    }

    if (hasViator && query.includePaid !== false) {
      const tours = await this.fallback.searchTours?.(query);
      results.push(
        ...(tours ?? []).map((t) => ({
          ...t,
          source: "viator" as const,
          provider: "viator",
        })),
      );
    }

    return results;
  }
}

export function createEventProvider(env: Env): EventProvider {
  switch (env.providers.events) {
    case "eventbrite":
      return createEventbriteEventProvider(env);
    case "viator":
      return new CompositeEventProvider(undefined, env.secrets.viatorApiKey);
    case "composite":
      return new CompositeEventProvider(
        env.secrets.eventbriteToken,
        env.secrets.viatorApiKey,
      );
    case "mock":
      return new MockEventProvider();
    default:
      throw new Error(`Unknown PROVIDER_EVENTS: ${env.providers.events}`);
  }
}
