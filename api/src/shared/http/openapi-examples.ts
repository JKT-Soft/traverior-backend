/** Shared Swagger Try-it-out values: a valid 7-day Japan trip from Jakarta. */

export const SAMPLE_TRIP_ID = "11111111-1111-4111-8111-111111111111";
export const SAMPLE_NODE_ID = "22222222-2222-4222-8222-222222222222";
export const SAMPLE_PLACE_ID = "33333333-3333-4333-8333-333333333333";

export const SAMPLE_DATES = {
  start: "2026-10-01",
  end: "2026-10-08",
} as const;

export const SAMPLE_OSAKA = {
  city: "Osaka",
  lat: 34.6937,
  lng: 135.5023,
} as const;

export const SAMPLE_JAKARTA = {
  city: "Jakarta",
  lat: -6.2088,
  lng: 106.8456,
} as const;

export const SAMPLE_PREFERENCES = {
  originCity: SAMPLE_JAKARTA.city,
  destination: "Japan",
  startDate: SAMPLE_DATES.start,
  endDate: SAMPLE_DATES.end,
  dateFlexibility: "exact",
  partySize: 2,
  budgetTone: "mid",
  pace: "moderate",
  passportCountry: "ID",
  travelWith: "couple",
} as const;

export const SAMPLE_TOOL_CONTEXT = {
  originIata: "CGK",
  destinationIata: "KIX",
  departureDate: SAMPLE_DATES.start,
  returnDate: SAMPLE_DATES.end,
  checkIn: SAMPLE_DATES.start,
  checkOut: SAMPLE_DATES.end,
  adults: 2,
  passportCountry: "ID",
  originLat: SAMPLE_JAKARTA.lat,
  originLng: SAMPLE_JAKARTA.lng,
  destLat: SAMPLE_OSAKA.lat,
  destLng: SAMPLE_OSAKA.lng,
} as const;

export const SAMPLE_SKELETON = {
  title: "Japan Adventure",
  summary: "7 days Osaka–Kyoto–Tokyo",
  originCity: SAMPLE_JAKARTA.city,
  destinationSummary: "Osaka, Kyoto, Tokyo",
  assumedStartDate: SAMPLE_DATES.start,
  assumedEndDate: SAMPLE_DATES.end,
  partySize: 2,
  budgetTone: "mid",
  checkpoints: [
    {
      city: SAMPLE_OSAKA.city,
      countryCode: "JP",
      role: "STAY",
      days: 3,
      needs: ["flights", "hotels", "places"],
      notes: "Arrive via KIX",
    },
  ],
} as const;
