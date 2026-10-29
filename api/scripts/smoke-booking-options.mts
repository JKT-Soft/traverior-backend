/**
 * Live smoke: search → Playwright booking capture → print all vendors.
 */
import {
  closeGoogleFlightsBrowser,
  fetchGoogleBookingOptions,
} from "../src/modules/flights/infra/google-flights-booking.js";

const d = new Date();
d.setDate(d.getDate() + 45);
const date = d.toISOString().slice(0, 10);

console.log("closing prior browser…");
await closeGoogleFlightsBrowser();
console.log("capturing vendors…");
const started = Date.now();
const options = await fetchGoogleBookingOptions({
  currency: "IDR",
  language: "en",
  origin: "CGK",
  destination: "ICN",
  departureDate: "2026-12-12",
  airlineName: "Asiana",
  timeoutMs: 70_000,
});
await closeGoogleFlightsBrowser();

console.log("elapsedMs", Date.now() - started);
console.log("vendorCount", options.length);
for (const o of options) {
  console.log(
    "-",
    o.agency.padEnd(22),
    o.isAirlineDirect ? "airline" : "ota    ",
    String(o.price.amount).padStart(6),
    o.price.currency,
    o.bookingUrl.slice(0, 55),
  );
}
process.exit(options.length >= 3 ? 0 : 2);
