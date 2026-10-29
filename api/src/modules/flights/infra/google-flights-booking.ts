import type { Browser, Page, Response } from "playwright";
import type { FlightBookingOption } from "../domain/ports.js";
import { buildBookingDeepLink } from "./map-google-flights-offer.js";
import { iterWrbPayloads } from "./google-flights-rpc.js";

export type FetchGoogleBookingOptionsInput = {
  /** Optional — UI click flow does not require the scraped token. */
  bookingToken?: string;
  currency?: string;
  language?: string;
  timeoutMs?: number;
  /** Route context — enables the one-way UI click flow that triggers GetBookingResults. */
  origin?: string;
  destination?: string;
  departureDate?: string;
  flightNumber?: string;
  airlineName?: string;
};

export type GoogleBookingFetcher = (
  input: FetchGoogleBookingOptionsInput,
) => Promise<FlightBookingOption[]>;

const DEFAULT_TIMEOUT_MS = 55_000;

let browserPromise: Promise<Browser> | null = null;

async function getSharedBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const { chromium } = await import("playwright");
      const args = ["--disable-blink-features=AutomationControlled"];
      const channel = process.env.GOOGLE_FLIGHTS_PLAYWRIGHT_CHANNEL?.trim();
      // Bundled Chromium first (after `npx playwright install chromium`).
      // Set GOOGLE_FLIGHTS_PLAYWRIGHT_CHANNEL=chrome to force system Chrome.
      if (channel) {
        return await chromium.launch({
          channel: channel as "chrome",
          headless: true,
          args,
          timeout: 25_000,
        });
      }
      try {
        return await chromium.launch({ headless: true, args, timeout: 25_000 });
      } catch {
        return await chromium.launch({
          channel: "chrome",
          headless: true,
          args,
          timeout: 25_000,
        });
      }
    })().catch((error) => {
      browserPromise = null;
      throw error;
    });
  }
  return browserPromise;
}

/** Close the shared Chromium instance (tests / graceful shutdown). */
export async function closeGoogleFlightsBrowser(): Promise<void> {
  if (!browserPromise) return;
  try {
    const browser = await browserPromise;
    await browser.close();
  } finally {
    browserPromise = null;
  }
}

/**
 * Capture every Google Flights "Book with …" vendor card (airline + OTA),
 * including rows hidden behind "N more booking options".
 *
 * Primary source: GetBookingResults RPC (has deep links).
 * Supplement: DOM scrape of the booking-options list (same UI the user sees).
 */
export async function fetchGoogleBookingOptions(
  input: FetchGoogleBookingOptionsInput,
): Promise<FlightBookingOption[]> {
  const scrapeCurrency = "USD";
  const language = input.language ?? "en";
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const token = input.bookingToken?.trim() ?? "";

  const origin = input.origin?.trim().toUpperCase();
  const destination = input.destination?.trim().toUpperCase();
  const departureDate = input.departureDate?.trim();
  const canSearchClick = Boolean(origin && destination && departureDate);
  if (!canSearchClick && !token) return [];

  const browser = await getSharedBrowser();
  const context = await browser.newContext({
    locale: language.startsWith("en") ? "en-US" : language,
    viewport: { width: 1400, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
  });
  await context.addInitScript(
    `Object.defineProperty(navigator, 'webdriver', { get: () => undefined });`,
  );
  const page = await context.newPage();

  const bodies: string[] = [];
  const seenBodies = new Set<string>();
  const inFlight: Promise<void>[] = [];

  const onResponse = (response: Response) => {
    if (!response.url().includes("GetBookingResults")) return;
    if (response.status() >= 400) return;
    const task = (async () => {
      try {
        // Prefer body() immediately; optionally wait briefly for finished.
        const text = await Promise.race([
          (async () => {
            await Promise.race([
              response.finished().catch(() => undefined),
              sleep(2_000),
            ]);
            return (await response.body()).toString("utf8");
          })(),
          sleep(10_000).then(() => ""),
        ]);
        if (!text || text.length < 40) return;
        if (seenBodies.has(text)) return;
        seenBodies.add(text);
        bodies.push(text);
      } catch {
        // Body may be invalidated by a subsequent navigation.
      }
    })();
    inFlight.push(task);
  };

  page.on("response", onResponse);

  let bookingPageUrl = "";
  try {
    if (canSearchClick) {
      bookingPageUrl = await captureViaSearchClick(page, {
        origin: origin!,
        destination: destination!,
        departureDate: departureDate!,
        currency: scrapeCurrency,
        language,
        flightNumber: input.flightNumber,
        airlineName: input.airlineName,
        timeoutMs,
      });
    }

    if (bodies.length === 0 && !bookingPageUrl && token) {
      const url = buildBookingDeepLink(token, scrapeCurrency, language);
      await page.goto(`${url}&gl=US`, {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs,
      });
      await sleep(5_000);
      bookingPageUrl = page.url();
    }

    if (bookingPageUrl || page.url().includes("/booking")) {
      await expandAllBookingOptions(page);
      await sleep(2_500);
    }

    await Promise.race([Promise.allSettled(inFlight), sleep(10_000)]);

    const fromRpc = collectOptions(bodies, scrapeCurrency);
    const fromDom = await scrapeDomBookingOptions(
      page,
      scrapeCurrency,
      bookingPageUrl || page.url(),
    );
    return mergeProviderOptions(fromRpc, fromDom);
  } finally {
    page.off("response", onResponse);
    await Promise.race([Promise.allSettled(inFlight), sleep(3_000)]);
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
}

async function captureViaSearchClick(
  page: Page,
  args: {
    origin: string;
    destination: string;
    departureDate: string;
    currency: string;
    language: string;
    flightNumber?: string;
    airlineName?: string;
    timeoutMs: number;
  },
): Promise<string> {
  const q = encodeURIComponent(
    `One way flights to ${args.destination} from ${args.origin} on ${args.departureDate}`,
  );
  const searchUrl = `https://www.google.com/travel/flights?hl=${encodeURIComponent(args.language)}&curr=${encodeURIComponent(args.currency)}&gl=US&q=${q}`;

  await page.goto(searchUrl, {
    waitUntil: "domcontentloaded",
    timeout: args.timeoutMs,
  });

  await selectOneWay(page);
  await page
    .locator("li")
    .filter({ hasText: /\b(AM|PM)\b/ })
    .first()
    .waitFor({ timeout: Math.min(args.timeoutMs, 25_000) })
    .catch(() => undefined);
  await sleep(2_000);

  const clicked = await clickFlightRow(page, {
    flightNumber: args.flightNumber,
    airlineName: args.airlineName,
  });
  if (!clicked) return "";

  await page
    .waitForURL("**/travel/flights/booking**", {
      timeout: Math.min(args.timeoutMs, 40_000),
    })
    .catch(() => undefined);

  // Allow GetBookingResults (+ refinements) to land in the response listener.
  await sleep(5_000);
  return page.url().includes("/booking") ? page.url() : "";
}

/** Expand the collapsed "N more booking options" row so every OTA is visible. */
async function expandAllBookingOptions(page: Page): Promise<void> {
  const more = page.getByText(/\d+\s+more booking options/i).first();
  if ((await more.count()) === 0) return;
  await more.click({ timeout: 3_000 }).catch(() => undefined);
  await sleep(2_500);
  // Some UIs nest another "more" after the first expand.
  const moreAgain = page.getByText(/\d+\s+more booking options/i).first();
  if (await moreAgain.count()) {
    await moreAgain.click({ timeout: 2_000 }).catch(() => undefined);
    await sleep(1_500);
  }
}

/**
 * Scrape the same "Book with …" cards Google Flights renders in the booking UI.
 * Used to surface every provider (including those only visible after expand).
 */
async function scrapeDomBookingOptions(
  page: Page,
  currency: string,
  fallbackBookingUrl: string,
): Promise<FlightBookingOption[]> {
  if (page.isClosed()) return [];

  type DomRow = {
    agency: string;
    amount: number;
    isAirlineDirect: boolean;
    href: string | null;
  };

  const rows = await page
    .evaluate(() => {
      const body = document.body.innerText;
      const start = body.search(/Booking options/i);
      if (start < 0) return [] as DomRow[];
      const rest = body.slice(start);
      const end = rest.search(/\nPrices include required/i);
      const section = end > 0 ? rest.slice(0, end) : rest.slice(0, 5000);

      const clkHrefs = [...document.querySelectorAll("a[href*='/travel/clk']")].map(
        (a) => (a as HTMLAnchorElement).href,
      );

      const out: DomRow[] = [];
      const seen = new Set<string>();
      const chunks = section.split(/Book with /i).slice(1);
      let clkIndex = 0;

      for (const chunk of chunks) {
        const head = (chunk.split("\n")[0] ?? "").trim();
        const isAirlineDirect = /Airline/i.test(head) || /^[^\n]{0,40}Airline/i.test(chunk);
        // Google glues the "Airline" badge onto the name ("Asiana AirlinesAirline").
        // Only strip a trailing badge — never the substring inside "Airlines".
        let agency = head
          .replace(/Airline$/i, "")
          .replace(/from\s*\$.*/i, "")
          .replace(/\$.*/g, "")
          .replace(/Continue.*/i, "")
          .replace(/\s+/g, " ")
          .trim();
        if (!agency || agency.length > 60) continue;
        const key = agency.toLowerCase();
        if (seen.has(key)) continue;

        const priceMatch = chunk.match(/\$\s*([0-9][0-9,]*(?:\.[0-9]+)?)/);
        if (!priceMatch) continue;
        const amount = Number(priceMatch[1].replace(/,/g, ""));
        if (!Number.isFinite(amount) || amount <= 0) continue;

        seen.add(key);
        const href = clkHrefs[clkIndex] ?? null;
        if (href) clkIndex += 1;
        out.push({ agency, amount, isAirlineDirect, href });
      }
      return out;
    })
    .catch(() => [] as DomRow[]);

  return rows.map((row, index) => {
    const bookingUrl =
      row.href && row.href.startsWith("http")
        ? row.href
        : fallbackBookingUrl.startsWith("http")
          ? fallbackBookingUrl
          : `https://www.google.com/travel/flights`;
    return {
      id: `dom-${row.agency}-${index}`.replace(/\s+/g, ""),
      agency: row.agency,
      agencyCode: null,
      price: { amount: row.amount, currency, isEstimate: true },
      bookingUrl,
      isAirlineDirect: row.isAirlineDirect,
      fareName: row.isAirlineDirect ? "Airline" : null,
      logoUrl: null,
    } satisfies FlightBookingOption;
  });
}

/**
 * Prefer RPC rows (real deep links). Fill gaps from DOM so the sheet matches
 * Google's full provider list. One card per agency (lowest price wins).
 */
export function mergeProviderOptions(
  fromRpc: FlightBookingOption[],
  fromDom: FlightBookingOption[],
): FlightBookingOption[] {
  const byAgency = new Map<string, FlightBookingOption>();

  const consider = (option: FlightBookingOption, preferUrl: boolean) => {
    const key = option.agency.trim().toLowerCase();
    if (!key) return;
    const existing = byAgency.get(key);
    if (!existing) {
      byAgency.set(key, option);
      return;
    }
    const existingIsClk =
      existing.bookingUrl.includes("/travel/clk") ||
      /^https?:\/\/(?!www\.google\.com\/travel\/flights)/i.test(existing.bookingUrl);
    const nextIsClk =
      option.bookingUrl.includes("/travel/clk") ||
      /^https?:\/\/(?!www\.google\.com\/travel\/flights)/i.test(option.bookingUrl);

    const betterUrl = preferUrl && nextIsClk && !existingIsClk;
    const betterPrice =
      option.price.amount > 0 &&
      (existing.price.amount <= 0 || option.price.amount < existing.price.amount);

    if (betterUrl || (betterPrice && !(existingIsClk && !nextIsClk))) {
      byAgency.set(key, {
        ...option,
        // Keep a real vendor URL when replacing only for price.
        bookingUrl: nextIsClk ? option.bookingUrl : existing.bookingUrl,
        agencyCode: option.agencyCode ?? existing.agencyCode,
        isAirlineDirect: option.isAirlineDirect || existing.isAirlineDirect,
        fareName: option.fareName ?? existing.fareName,
      });
    }
  };

  for (const option of fromRpc) consider(option, true);
  for (const option of fromDom) consider(option, false);

  return [...byAgency.values()].sort((a, b) => {
    if (a.price.amount <= 0) return 1;
    if (b.price.amount <= 0) return -1;
    return a.price.amount - b.price.amount;
  });
}

async function selectOneWay(page: Page): Promise<void> {
  const tripToggle = page
    .locator('div[role="combobox"], span, button')
    .filter({ hasText: /^Round trip$/i })
    .first();
  if ((await tripToggle.count()) === 0) return;
  await tripToggle.click({ timeout: 3_000 }).catch(() => undefined);
  await sleep(400);
  const oneWay = page
    .locator('[role="option"], li, span, div[role="menuitem"]')
    .filter({ hasText: /^One way$/i })
    .first();
  if (await oneWay.count()) {
    await oneWay.click({ timeout: 3_000 }).catch(() => undefined);
  }
}

async function clickFlightRow(
  page: Page,
  match: { flightNumber?: string; airlineName?: string },
): Promise<boolean> {
  const airline = (match.airlineName ?? "").trim();
  if (airline) {
    const byAirline = page
      .locator("li")
      .filter({ hasText: new RegExp(escapeRegExp(airline), "i") });
    if ((await byAirline.count()) > 0) {
      await byAirline.first().click({ timeout: 10_000 });
      return true;
    }
  }

  const rows = page.locator("li").filter({ hasText: /\b(AM|PM)\b/ });
  const count = await rows.count();
  if (count === 0) return false;

  const flightDigits = (match.flightNumber ?? "").replace(/\D/g, "");
  let targetIndex = 0;
  if (flightDigits) {
    for (let i = 0; i < Math.min(count, 40); i++) {
      const text = ((await rows.nth(i).innerText().catch(() => "")) || "")
        .replace(/\s+/g, " ")
        .toLowerCase();
      if (text.includes(flightDigits)) {
        targetIndex = i;
        break;
      }
    }
  }

  await rows.nth(targetIndex).click({ timeout: 10_000 });
  return true;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectOptions(bodies: string[], currency: string): FlightBookingOption[] {
  const options: FlightBookingOption[] = [];
  const dedupe = new Set<string>();
  for (const body of bodies) {
    for (const payload of iterWrbPayloads(body)) {
      for (const option of parseBookingOptions(payload, currency)) {
        const key = `${option.agencyCode ?? ""}|${option.agency}|${option.bookingUrl}|${option.price.amount}`;
        if (dedupe.has(key)) continue;
        dedupe.add(key);
        options.push(option);
      }
    }
  }
  return options;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Walk a GetBookingResults payload and extract vendor booking rows.
 * Shape verified against fli / live Google Flights captures (2026).
 */
export function parseBookingOptions(
  payload: unknown,
  fallbackCurrency = "USD",
): FlightBookingOption[] {
  const out: FlightBookingOption[] = [];
  walkBookingRows(payload, out, fallbackCurrency.toUpperCase());
  return out;
}

function walkBookingRows(
  node: unknown,
  out: FlightBookingOption[],
  currency: string,
): void {
  if (!Array.isArray(node)) return;
  const parsed = tryParseBookingRow(node, currency);
  if (parsed) {
    out.push(parsed);
    return;
  }
  for (const child of node) {
    walkBookingRows(child, out, currency);
  }
}

function tryParseBookingRow(
  row: unknown[],
  fallbackCurrency: string,
): FlightBookingOption | null {
  if (row.length < 8) return null;
  if (typeof row[0] !== "number") return null;

  const vendorBlock = row[1];
  if (!Array.isArray(vendorBlock) || vendorBlock.length === 0) return null;
  const firstVendor = vendorBlock[0];
  if (
    !Array.isArray(firstVendor) ||
    firstVendor.length < 2 ||
    typeof firstVendor[0] !== "string" ||
    typeof firstVendor[1] !== "string"
  ) {
    return null;
  }

  const agencyCode = String(firstVendor[0]).trim() || null;
  const agency = String(firstVendor[1]).trim();
  if (!agency) return null;

  const isAirlineDirect =
    firstVendor.length >= 4 && typeof firstVendor[3] === "boolean"
      ? firstVendor[3]
      : false;

  const { bookingUrl } = extractBookingUrls(row[5]);
  if (!bookingUrl) return null;

  const { amount, currency } = extractPrice(row[7], fallbackCurrency);
  const fareName = extractFareName(row);

  return {
    id: `${agencyCode ?? agency}-${row[0]}`.replace(/\s+/g, ""),
    agency,
    agencyCode,
    price: {
      amount,
      currency,
      isEstimate: true,
    },
    bookingUrl,
    isAirlineDirect,
    fareName: fareName ?? (isAirlineDirect ? "Airline" : null),
    logoUrl: logoUrlForCode(agencyCode),
  };
}

function extractBookingUrls(block: unknown): {
  bookingUrl: string | null;
  googleClickUrl: string | null;
} {
  if (!Array.isArray(block)) return { bookingUrl: null, googleClickUrl: null };

  let vendorUrl: string | null = null;
  if (typeof block[0] === "string" && block[0].trim()) {
    const raw = block[0].trim();
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      vendorUrl = raw;
    } else if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(raw) && !/\s/.test(raw)) {
      vendorUrl = `https://${raw}`;
    }
  }

  let googleClickUrl: string | null = null;
  if (Array.isArray(block[2])) {
    const baseRaw = typeof block[2][0] === "string" ? block[2][0].trim() : "";
    if (baseRaw.includes("/travel/clk") || baseRaw.startsWith("http")) {
      const absolute = baseRaw.startsWith("http")
        ? baseRaw
        : `https://www.google.com${baseRaw.startsWith("/") ? "" : "/"}${baseRaw}`;
      const qs = new URLSearchParams();
      if (Array.isArray(block[2][1])) {
        for (const pair of block[2][1]) {
          if (
            Array.isArray(pair) &&
            typeof pair[0] === "string" &&
            typeof pair[1] === "string"
          ) {
            qs.set(pair[0], pair[1]);
          }
        }
      }
      const query = qs.toString();
      googleClickUrl = query ? `${absolute}?${query}` : absolute;
    }
  }

  return {
    bookingUrl: vendorUrl ?? googleClickUrl,
    googleClickUrl,
  };
}

function extractPrice(
  block: unknown,
  fallbackCurrency: string,
): { amount: number; currency: string } {
  if (!Array.isArray(block) || !Array.isArray(block[0])) {
    return { amount: 0, currency: fallbackCurrency };
  }
  const raw = block[0][block[0].length - 1];
  const amount =
    typeof raw === "number" && Number.isFinite(raw) ? Number(raw) : 0;
  return { amount, currency: fallbackCurrency };
}

function extractFareName(row: unknown[]): string | null {
  if (row.length > 21 && Array.isArray(row[21]) && typeof row[21][3] === "string") {
    const name = row[21][3].trim();
    if (name) return name;
  }
  try {
    const label = (row[14] as unknown[])?.[0] as unknown[];
    const nested = (label?.[0] as unknown[])?.[1] as unknown[];
    const code = nested?.[1];
    if (typeof code === "string" && code.trim()) return code.trim();
  } catch {
    // ignore shape misses
  }
  return null;
}

function logoUrlForCode(code: string | null): string | null {
  if (!code) return null;
  return null;
}
