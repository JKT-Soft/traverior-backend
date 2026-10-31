import type {
  CheckpointNeed,
  SkeletonCheckpoint,
  TripSkeleton,
} from "../domain/skeleton.js";
import {
  allocateCheckpointWindows,
  hotelCheckOutIso,
} from "../domain/checkpoint-schedule.js";
import {
  DEFAULT_ORIGIN_CITY,
  resolvePrimaryAirportIata,
} from "../domain/normalize-skeleton.js";
import type { PlannerToolContext } from "../../../shared/mcp/types.js";

export type ToolCallSpec = {
  tool: string;
  arguments: Record<string, unknown>;
};

export function buildToolCallsForNeed(
  need: CheckpointNeed,
  checkpoint: SkeletonCheckpoint,
  ctx: PlannerToolContext,
): ToolCallSpec[] {
  switch (need) {
    case "flights":
      if (!ctx.originIata || !ctx.destinationIata || !ctx.departureDate) return [];
      return [
        {
          tool: "search_flights",
          arguments: {
            origin: ctx.originIata,
            destination: ctx.destinationIata,
            departureDate: ctx.departureDate,
            returnDate: ctx.returnDate,
            adults: ctx.adults ?? 1,
          },
        },
      ];
    case "hotels":
      if (!ctx.checkIn || !ctx.checkOut) return [];
      return [
        {
          tool: "search_hotels",
          arguments: {
            cityName: checkpoint.city,
            countryCode: checkpoint.countryCode,
            checkIn: ctx.checkIn,
            checkOut: ctx.checkOut,
            adults: ctx.adults ?? 1,
          },
        },
      ];
    case "places":
      return [
        { tool: "search_restaurants", arguments: { city: checkpoint.city } },
        { tool: "search_pois", arguments: { city: checkpoint.city } },
      ];
    case "routes":
      if (
        ctx.originLat == null ||
        ctx.originLng == null ||
        ctx.destLat == null ||
        ctx.destLng == null
      ) {
        return [];
      }
      return [
        {
          tool: "get_route",
          arguments: {
            originLat: ctx.originLat,
            originLng: ctx.originLng,
            destinationLat: ctx.destLat,
            destinationLng: ctx.destLng,
            mode: "TRANSIT",
          },
        },
      ];
    case "weather":
      if (ctx.destLat == null || ctx.destLng == null) return [];
      return [
        {
          tool: "get_forecast",
          arguments: { lat: ctx.destLat, lon: ctx.destLng },
        },
      ];
    case "events":
      return [
        {
          tool: "search_events",
          arguments: {
            city: checkpoint.city,
            startDate: ctx.checkIn,
            endDate: ctx.checkOut,
            includeFree: true,
            includePaid: true,
          },
        },
      ];
    case "visa":
      return [
        {
          tool: "get_visa_requirements",
          arguments: {
            passportCountry: ctx.passportCountry ?? "ID",
            destinationCountry: checkpoint.countryCode ?? "JP",
            travelDate: ctx.departureDate ?? ctx.checkIn,
          },
        },
      ];
    case "checklist":
      return [
        {
          tool: "generate_checklist",
          arguments: {
            destination: checkpoint.city,
            countryCode: checkpoint.countryCode,
            passportCountry: ctx.passportCountry ?? "ID",
            ...(ctx.omitTripChecklistItems ? { omitTripItems: true } : {}),
          },
        },
      ];
    default:
      return [];
  }
}

function airportOf(city: string | undefined, explicit?: string | null): string | undefined {
  return explicit?.toUpperCase() ?? (city ? resolvePrimaryAirportIata(city) : undefined);
}

export function buildToolPlan(
  skeleton: TripSkeleton,
  ctx: PlannerToolContext,
): Array<{ checkpoint: SkeletonCheckpoint; calls: ToolCallSpec[] }> {
  const lastIndex = skeleton.checkpoints.length - 1;
  const homeIata = ctx.originIata ?? skeleton.originIata;
  const countriesWithTripChecklist = new Set<string>();
  let emittedTripChecklist = false;
  const windows = allocateCheckpointWindows(skeleton.checkpoints, {
    start: ctx.checkIn ?? ctx.departureDate,
    end: ctx.checkOut ?? ctx.returnDate,
  });

  return skeleton.checkpoints.map((checkpoint, index) => {
    const window = windows[index];
    const isFirst = index === 0;
    const isLast = index === lastIndex;
    const roundTrip = isFirst && isLast;
    const tripReturn = ctx.returnDate ?? ctx.checkOut;
    const checkpointIata =
      airportOf(checkpoint.city, checkpoint.airportIata) ??
      (isFirst ? ctx.destinationIata?.toUpperCase() : undefined);
    const previous =
      index > 0 ? skeleton.checkpoints[index - 1] : undefined;
    const previousIata = index > 0
      ? airportOf(previous?.city, previous?.airportIata)
      : homeIata;

    let stayCtx: PlannerToolContext = { ...ctx };
    if (window) {
      stayCtx = {
        ...stayCtx,
        checkIn: window.start,
        checkOut: hotelCheckOutIso(window),
        departureDate: isFirst ? (ctx.departureDate ?? window.start) : window.start,
        returnDate: roundTrip ? tripReturn : undefined,
      };
    }

    const country = checkpoint.countryCode?.trim().toUpperCase();
    let omitTripChecklistItems = false;
    if (checkpoint.needs.includes("checklist")) {
      if (country) {
        omitTripChecklistItems = countriesWithTripChecklist.has(country);
        countriesWithTripChecklist.add(country);
      } else {
        omitTripChecklistItems = emittedTripChecklist;
        emittedTripChecklist = true;
      }
    }
    localCtx = { ...localCtx, omitTripChecklistItems };

    const calls: ToolCallSpec[] = [];
    for (const need of checkpoint.needs) {
      if (need !== "flights") {
        calls.push(
          ...buildToolCallsForNeed(need, checkpoint, {
            ...stayCtx,
            originIata: previousIata,
            destinationIata: checkpointIata ?? ctx.destinationIata,
          }),
        );
        continue;
      }

      if (roundTrip) {
        // Single-city: one round-trip search covers outbound + return.
        calls.push(
          ...buildToolCallsForNeed("flights", checkpoint, {
            ...stayCtx,
            originIata: homeIata,
            destinationIata: checkpointIata ?? ctx.destinationIata,
            departureDate: ctx.departureDate ?? window?.start ?? stayCtx.departureDate,
            returnDate: tripReturn,
          }),
        );
        continue;
      }

      if (isLast) {
        // Hop into the last city when the previous stop uses a different airport.
        if (previousIata && checkpointIata && previousIata !== checkpointIata) {
          calls.push(
            ...buildToolCallsForNeed("flights", checkpoint, {
              ...stayCtx,
              originIata: previousIata,
              destinationIata: checkpointIata,
              departureDate: window?.start ?? stayCtx.departureDate,
              returnDate: undefined,
            }),
          );
        }
        // Always search the return home leg on the last checkpoint.
        if (checkpointIata && homeIata) {
          calls.push(
            ...buildToolCallsForNeed("flights", checkpoint, {
              ...stayCtx,
              originIata: checkpointIata,
              destinationIata: homeIata,
              departureDate: tripReturn ?? window?.end ?? stayCtx.departureDate,
              returnDate: undefined,
            }),
          );
        }
        continue;
      }

      // First or middle one-way hop into this city.
      calls.push(
        ...buildToolCallsForNeed("flights", checkpoint, {
          ...stayCtx,
          originIata: previousIata,
          destinationIata: checkpointIata ?? ctx.destinationIata,
          departureDate: isFirst
            ? (ctx.departureDate ?? window?.start ?? stayCtx.departureDate)
            : (window?.start ?? stayCtx.departureDate),
          returnDate: undefined,
        }),
      );
    }
    return { checkpoint, calls };
  });
}
