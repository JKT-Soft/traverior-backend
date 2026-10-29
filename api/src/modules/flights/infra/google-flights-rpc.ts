/**
 * Google Travel Flights — internal GetShoppingResults RPC client.
 * Replicates the browser's form-urlencoded f.req payload (no official public API).
 */

export const GOOGLE_FLIGHTS_RPC_URL =
  "https://www.google.com/_/FlightsFrontendUi/data/travel.frontend.flights.FlightsFrontendService/GetShoppingResults";

export const GOOGLE_FLIGHTS_HTML_URL = "https://www.google.com/travel/flights";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";

export const GoogleFlightsSeat = {
  economy: 1,
  premium_economy: 2,
  business: 3,
  first: 4,
} as const;

export const GoogleFlightsTrip = {
  roundTrip: 1,
  oneWay: 2,
} as const;

export type GoogleFlightsRpcSearchInput = {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  adults?: number;
  cabinClass?: keyof typeof GoogleFlightsSeat;
  currency?: string;
  language?: string;
};

export type GoogleFlightsAirport = {
  code: string;
  name: string;
};

export type GoogleFlightsSegment = {
  from: GoogleFlightsAirport;
  to: GoogleFlightsAirport;
  departureAt: string;
  arrivalAt: string;
  durationMinutes: number;
  flightNumber: string;
  airlineCode: string | null;
  airlineName: string | null;
  aircraft: string | null;
};

export type GoogleFlightsItinerary = {
  /** Display label from Google (e.g. "Nonstop", "1 stop"). */
  typeLabel: string;
  price: number;
  /** Opaque token from Google's price block — opens booking page via `tfu=`. */
  bookingToken: string | null;
  airlineNames: string[];
  segments: GoogleFlightsSegment[];
};

export type GoogleFlightsAirlineMeta = {
  code: string;
  name: string;
};

export type GoogleFlightsShoppingResult = {
  currency: string;
  itineraries: GoogleFlightsItinerary[];
  airlines: GoogleFlightsAirlineMeta[];
};

type RpcSegmentFilter = [
  [[[string, number]]],
  [[[string, number]]],
  null,
  number,
  string[] | null,
  null,
  string,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  number,
];

export function buildRpcPayload(input: GoogleFlightsRpcSearchInput): string {
  const origin = input.origin.trim().toUpperCase();
  const destination = input.destination.trim().toUpperCase();
  const adults = Math.max(1, Math.min(9, input.adults ?? 1));
  const seat = GoogleFlightsSeat[input.cabinClass ?? "economy"] ?? GoogleFlightsSeat.economy;
  const trip = input.returnDate ? GoogleFlightsTrip.roundTrip : GoogleFlightsTrip.oneWay;

  const segments: RpcSegmentFilter[] = [
    buildRpcSegment(origin, destination, input.departureDate),
  ];
  if (input.returnDate) {
    segments.push(buildRpcSegment(destination, origin, input.returnDate));
  }

  // Passenger counts: [adults, children, infants_in_seat, infants_on_lap]
  const pax = [adults, 0, 0, 0];

  const filters = [
    [],
    [
      null,
      null,
      trip,
      null,
      [],
      seat,
      pax,
      null,
      null,
      null,
      null,
      null,
      null,
      segments,
      null,
      null,
      null,
      1,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ],
    1,
    0,
    0,
    2,
  ];

  const wrapped = JSON.stringify([null, JSON.stringify(filters)]);
  return `f.req=${encodeURIComponent(wrapped)}`;
}

function buildRpcSegment(from: string, to: string, date: string): RpcSegmentFilter {
  return [
    [[[from, 0]]],
    [[[to, 0]]],
    null,
    0, // max stops unconstrained (0 = any)
    null,
    null,
    date,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    3,
  ];
}

export function buildRpcUrl(currency?: string, language?: string): string {
  const params = new URLSearchParams();
  if (language?.trim()) params.set("hl", language.trim());
  if (currency?.trim()) params.set("curr", currency.trim().toUpperCase());
  const qs = params.toString();
  return qs ? `${GOOGLE_FLIGHTS_RPC_URL}?${qs}` : GOOGLE_FLIGHTS_RPC_URL;
}

export async function fetchGoogleFlightsShopping(
  input: GoogleFlightsRpcSearchInput,
): Promise<GoogleFlightsShoppingResult> {
  const currency = (input.currency ?? "USD").toUpperCase();
  const language = input.language ?? "en";

  // Prefer HTML scrape — Node fetch is often rejected by the RPC endpoint (empty wrb.fr / code 13).
  try {
    return await fetchViaHtml(input, currency, language);
  } catch (htmlError) {
    try {
      return await fetchViaRpc(input, currency, language);
    } catch {
      throw htmlError;
    }
  }
}

async function fetchViaHtml(
  input: GoogleFlightsRpcSearchInput,
  currency: string,
  language: string,
): Promise<GoogleFlightsShoppingResult> {
  const params = new URLSearchParams({
    hl: language,
    curr: currency,
    q: buildSearchQuery(input),
  });
  const res = await fetch(`${GOOGLE_FLIGHTS_HTML_URL}?${params.toString()}`, {
    method: "GET",
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": language,
      Referer: "https://www.google.com/",
    },
  });
  const html = await res.text();
  if (!res.ok) {
    throw new Error(`Google Flights search failed (${res.status}): ${html.slice(0, 200)}`);
  }
  if (looksLikeCaptcha(html)) {
    throw new Error("Google Flights search failed: captcha challenge");
  }
  return parseHtmlShoppingResponse(html, currency);
}

async function fetchViaRpc(
  input: GoogleFlightsRpcSearchInput,
  currency: string,
  language: string,
): Promise<GoogleFlightsShoppingResult> {
  const res = await fetch(buildRpcUrl(currency, language), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": UA,
      Referer: "https://www.google.com/travel/flights/search",
      Origin: "https://www.google.com",
      Accept: "*/*",
      "X-Same-Domain": "1",
    },
    body: buildRpcPayload(input),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Google Flights search failed (${res.status}): ${text.slice(0, 200)}`);
  }
  if (looksLikeCaptcha(text)) {
    throw new Error("Google Flights search failed: captcha challenge");
  }
  return parseRpcShoppingResponse(text, currency);
}

export function buildSearchQuery(input: GoogleFlightsRpcSearchInput): string {
  const parts = [
    `Flights from ${input.origin.trim().toUpperCase()} to ${input.destination.trim().toUpperCase()}`,
    `on ${input.departureDate}`,
  ];
  if (input.returnDate) {
    parts.push(`through ${input.returnDate}`);
  }
  return parts.join(" ");
}

export function parseHtmlShoppingResponse(
  html: string,
  currency: string,
): GoogleFlightsShoppingResult {
  const payload = extractHtmlPayload(html);
  return parseShoppingPayload(payload, currency);
}

export function parseRpcShoppingResponse(
  text: string,
  currency: string,
): GoogleFlightsShoppingResult {
  return parseShoppingPayload(extractRpcPayload(text), currency);
}

export function parseShoppingPayload(
  payload: unknown,
  currency: string,
): GoogleFlightsShoppingResult {
  if (!Array.isArray(payload)) {
    throw new Error("Google Flights search failed: unexpected payload shape");
  }

  const airlines = parseAirlineMetadata(payload);
  const itineraries: GoogleFlightsItinerary[] = [];

  // Best flights [2][0], other flights [3][0]
  for (const bucket of [payload[2]?.[0], payload[3]?.[0]]) {
    if (!Array.isArray(bucket)) continue;
    for (const entry of bucket) {
      const mapped = parseItineraryEntry(entry, airlines);
      if (mapped) itineraries.push(mapped);
    }
  }

  return { currency, itineraries, airlines };
}

function extractHtmlPayload(html: string): unknown {
  const classMarker = 'class="ds:1"';
  const classIdx = html.indexOf(classMarker);
  if (classIdx === -1) {
    throw new Error("Google Flights search failed: missing embedded flight data");
  }
  const tagClose = html.indexOf(">", classIdx + classMarker.length);
  if (tagClose === -1) {
    throw new Error("Google Flights search failed: malformed ds:1 script tag");
  }
  const end = html.indexOf("</script>", tagClose);
  if (end === -1) {
    throw new Error("Google Flights search failed: unclosed ds:1 script tag");
  }
  const js = html.slice(tagClose + 1, end);
  const dataIdx = js.indexOf("data:");
  if (dataIdx === -1) {
    throw new Error('Google Flights search failed: missing "data:" blob');
  }
  const afterData = dataIdx + 5;
  const lastComma = js.lastIndexOf(",");
  if (lastComma <= afterData) {
    throw new Error("Google Flights search failed: malformed data blob");
  }
  return JSON.parse(js.slice(afterData, lastComma));
}

/**
 * Extract all decoded wrb.fr inner payloads from a Google RPC response body.
 * GetBookingResults often emits multiple length-prefixed chunks.
 */
export function iterWrbPayloads(text: string): unknown[] {
  const stripped = text.replace(/^\)\]\}'?\s*/, "").trim();
  if (!stripped) return [];

  const payloads: unknown[] = [];

  // Single-chunk JSON (common for GetShoppingResults)
  if (!/^\d/.test(stripped)) {
    try {
      const inner = parseInnerFromOuter(JSON.parse(stripped));
      if (inner != null) payloads.push(inner);
    } catch {
      // ignore malformed
    }
    return payloads;
  }

  // Length-prefixed wrb.fr chunks (byte-length headers; best-effort via lines)
  const lines = stripped.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const header = lines[i]?.trim();
    if (!header || !/^\d+$/.test(header)) continue;
    const chunk = lines[i + 1];
    if (!chunk) continue;
    try {
      const outer = JSON.parse(chunk);
      const inner = parseInnerFromOuter(outer);
      if (inner != null) payloads.push(inner);
    } catch {
      continue;
    }
  }
  return payloads;
}

function extractRpcPayload(text: string): unknown {
  const payloads = iterWrbPayloads(text);
  if (payloads.length === 0) {
    throw new Error("Google Flights search failed: empty response");
  }
  return payloads[0];
}

function parseInnerFromOuter(outer: unknown): unknown {
  if (!Array.isArray(outer) || !Array.isArray(outer[0])) {
    throw new Error("Google Flights search failed: missing wrb.fr envelope");
  }
  const innerJson = outer[0][2];
  if (typeof innerJson !== "string" || !innerJson) {
    // Empty booking/error envelopes use null at [0][2]
    return null;
  }
  return JSON.parse(innerJson);
}

function parseAirlineMetadata(payload: unknown[]): GoogleFlightsAirlineMeta[] {
  const root = payload[7];
  if (!Array.isArray(root) || !Array.isArray(root[1])) return [];
  const airlinesData = root[1][1];
  if (!Array.isArray(airlinesData)) return [];
  const out: GoogleFlightsAirlineMeta[] = [];
  for (const row of airlinesData) {
    if (!Array.isArray(row)) continue;
    const code = String(row[0] ?? "").trim().toUpperCase();
    const name = String(row[1] ?? "").trim();
    if (code) out.push({ code, name: name || code });
  }
  return out;
}

function parseItineraryEntry(
  entry: unknown,
  airlines: GoogleFlightsAirlineMeta[],
): GoogleFlightsItinerary | null {
  if (!Array.isArray(entry)) return null;
  const flight = entry[0];
  if (!Array.isArray(flight)) return null;

  const price = Number(entry[1]?.[0]?.[1] ?? 0);
  const bookingToken =
    typeof entry[1]?.[1] === "string" && entry[1][1].trim().length > 0
      ? String(entry[1][1]).trim()
      : null;
  const typeLabel = String(flight[0] ?? "");
  const airlineNames = Array.isArray(flight[1])
    ? flight[1].map((n) => String(n ?? "").trim()).filter(Boolean)
    : [];

  const segments: GoogleFlightsSegment[] = [];
  if (Array.isArray(flight[2])) {
    for (const raw of flight[2]) {
      const segment = parseSegment(raw, airlineNames[0] ?? null, airlines);
      if (segment) segments.push(segment);
    }
  }
  if (segments.length === 0) return null;

  return { typeLabel, price, bookingToken, airlineNames, segments };
}

function parseSegment(
  raw: unknown,
  fallbackAirlineName: string | null,
  airlines: GoogleFlightsAirlineMeta[],
): GoogleFlightsSegment | null {
  if (!Array.isArray(raw)) return null;

  const fromCode = String(raw[3] ?? "").trim().toUpperCase();
  const fromName = String(raw[4] ?? "").trim();
  // Google has swapped [5]/[6] historically; prefer the short IATA-looking value.
  const a5 = String(raw[5] ?? "").trim();
  const a6 = String(raw[6] ?? "").trim();
  const toCode = (looksLikeIata(a6) ? a6 : looksLikeIata(a5) ? a5 : a6 || a5).toUpperCase();
  const toName = looksLikeIata(a6) ? a5 : a6;

  if (!fromCode || !toCode) return null;

  const depTime = normalizeHm(raw[8]);
  const arrTime = normalizeHm(raw[10]);
  const depDate = normalizeYmd(raw[20]);
  const arrDate = normalizeYmd(raw[21]);
  const durationMinutes = Number(raw[11] ?? 0);
  const aircraft = emptyToNull(String(raw[17] ?? ""));

  const { code: airlineCode, name: airlineName, flightNumber } = extractCarrier(
    raw,
    fallbackAirlineName,
    airlines,
  );

  return {
    from: { code: fromCode, name: fromName },
    to: { code: toCode, name: toName },
    departureAt: toLocalIso(depDate, depTime),
    arrivalAt: toLocalIso(arrDate, arrTime),
    durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : 0,
    flightNumber,
    airlineCode,
    airlineName,
    aircraft,
  };
}

function extractCarrier(
  raw: unknown[],
  fallbackAirlineName: string | null,
  airlines: GoogleFlightsAirlineMeta[],
): { code: string | null; name: string | null; flightNumber: string } {
  let code: string | null = null;
  let name: string | null = fallbackAirlineName;
  let flightNumber = "";

  // [22] carrier blob — current shape: ["TR","275",null,"Scoot"]
  // older shape: ["GA","Garuda Indonesia"]
  const carrierBlob = raw[22];
  if (Array.isArray(carrierBlob)) {
    const a0 = String(carrierBlob[0] ?? "").trim().toUpperCase();
    const a1 = String(carrierBlob[1] ?? "").trim();
    const a3 = String(carrierBlob[3] ?? "").trim();
    if (/^[A-Z0-9]{2}$/.test(a0)) code = a0;

    if (/^\d+[A-Z]?$/.test(a1)) {
      flightNumber = code ? `${code}${a1}` : a1;
      if (a3) name = a3;
    } else if (a1) {
      name = a1;
    }
  } else if (typeof carrierBlob === "string" && /^[A-Z0-9]{2}$/i.test(carrierBlob.trim())) {
    code = carrierBlob.trim().toUpperCase();
  }

  const fnRaw = raw[24] ?? raw[23];
  if (!flightNumber) {
    if (typeof fnRaw === "string" && fnRaw.trim()) {
      flightNumber = fnRaw.trim();
    } else if (Array.isArray(fnRaw) && typeof fnRaw[0] === "string") {
      flightNumber = String(fnRaw[0]).trim();
    }
  }

  if (!code && name) {
    const match = airlines.find(
      (a) => a.name.toLowerCase() === name!.toLowerCase() || a.code === name!.toUpperCase(),
    );
    if (match) code = match.code;
  }

  if (flightNumber && code && !flightNumber.toUpperCase().startsWith(code)) {
    flightNumber = `${code}${flightNumber.replace(/\s+/g, "")}`;
  }
  if (!flightNumber && code) {
    flightNumber = code;
  }

  return { code, name, flightNumber };
}

function normalizeHm(value: unknown): [number, number] {
  if (!Array.isArray(value)) return [0, 0];
  const hour = value[0] == null ? 0 : Number(value[0]);
  const minute = value[1] == null ? 0 : Number(value[1]);
  return [
    Number.isFinite(hour) ? hour : 0,
    Number.isFinite(minute) ? minute : 0,
  ];
}

function normalizeYmd(value: unknown): [number, number, number] {
  if (!Array.isArray(value) || value.length < 3) return [1970, 1, 1];
  const y = Number(value[0]);
  const m = Number(value[1]);
  const d = Number(value[2]);
  return [
    Number.isFinite(y) ? y : 1970,
    Number.isFinite(m) ? m : 1,
    Number.isFinite(d) ? d : 1,
  ];
}

export function toLocalIso(
  date: [number, number, number],
  time: [number, number],
): string {
  const pad = (n: number) => String(Math.max(0, n)).padStart(2, "0");
  return `${date[0]}-${pad(date[1])}-${pad(date[2])}T${pad(time[0])}:${pad(time[1])}:00`;
}

function looksLikeIata(value: string): boolean {
  return /^[A-Za-z]{3}$/.test(value.trim());
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function looksLikeCaptcha(text: string): boolean {
  return text.includes("g-recaptcha") || text.includes('id="captcha"');
}
