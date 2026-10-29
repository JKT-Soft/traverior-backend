/** Pick the first absolute http(s) URL from provider payload fields. */
export function textUrl(...candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
  }
  return undefined;
}

/** Google Flights search — Duffel offers have no public checkout URL. */
export function flightSearchDeepLink(input: {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
}): string {
  const departure = input.departureDate.slice(0, 10);
  const ret = input.returnDate?.slice(0, 10);
  const q = ret
    ? `Flights from ${input.origin} to ${input.destination} on ${departure} return ${ret}`
    : `Flights from ${input.origin} to ${input.destination} on ${departure}`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}`;
}

/** Google Hotels search — LiteAPI needs a configured white-label domain for native links. */
export function hotelSearchDeepLink(input: {
  name: string;
  city?: string | null;
  checkIn: string;
  checkOut: string;
}): string {
  const q = [input.name, input.city].filter(Boolean).join(" ").trim() || input.name;
  const params = new URLSearchParams({
    q,
    checkin: input.checkIn.slice(0, 10),
    checkout: input.checkOut.slice(0, 10),
  });
  return `https://www.google.com/travel/hotels?${params.toString()}`;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function day(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = text(value);
  if (!raw) return undefined;
  return raw.slice(0, 10);
}

/** Resolve or synthesize a booking deep link from catalog / provider payload. */
export function resolveOfferDeepLink(
  kind: string,
  payload: Record<string, unknown>,
  fallback?: string | null,
): string | undefined {
  const existing = textUrl(fallback, payload.deepLinkUrl, payload.deepLink, payload.url);
  if (existing) return existing;

  if (kind === "flight") {
    const origin = text(payload.origin) ?? text(payload.originIata);
    const destination = text(payload.destination) ?? text(payload.destinationIata);
    const departureDate = day(payload.departureAt) ?? day(payload.departureDate);
    if (origin && destination && departureDate) {
      return flightSearchDeepLink({
        origin,
        destination,
        departureDate,
        returnDate: day(payload.returnDate),
      });
    }
  }

  if (kind === "hotel") {
    const location = record(payload.location);
    const name = text(payload.name);
    const city = text(payload.city) ?? text(location.city);
    const checkIn = day(payload.checkIn) ?? day(payload.check_in);
    const checkOut = day(payload.checkOut) ?? day(payload.check_out);
    if (name && checkIn && checkOut) {
      return hotelSearchDeepLink({ name, city, checkIn, checkOut });
    }
  }

  return undefined;
}
