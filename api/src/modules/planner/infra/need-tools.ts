import type {
  CheckpointNeed,
  SkeletonCheckpoint,
  TripSkeleton,
} from "../domain/skeleton.js";
import {
  allocateCheckpointWindows,
  hotelCheckOutIso,
} from "../domain/checkpoint-schedule.js";
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
            passportCountry: ctx.passportCountry ?? "ID",
          },
        },
      ];
    default:
      return [];
  }
}

export function buildToolPlan(
  skeleton: TripSkeleton,
  ctx: PlannerToolContext,
): Array<{ checkpoint: SkeletonCheckpoint; calls: ToolCallSpec[] }> {
  const lastIndex = skeleton.checkpoints.length - 1;
  const windows = allocateCheckpointWindows(skeleton.checkpoints, {
    start: ctx.checkIn ?? ctx.departureDate,
    end: ctx.checkOut ?? ctx.returnDate,
  });

  return skeleton.checkpoints.map((checkpoint, index) => {
    const window = windows[index];
    const isFirst = index === 0;
    const isLast = index === lastIndex;
    // Single-city: one round-trip search. Multi-city: outbound on first, return (swapped) on last.
    const returnOnly = isLast && !isFirst;
    const roundTrip = isFirst && isLast;
    const tripReturn = ctx.returnDate ?? ctx.checkOut;

    let localCtx: PlannerToolContext = ctx;
    if (window) {
      localCtx = {
        ...ctx,
        checkIn: window.start,
        checkOut: hotelCheckOutIso(window),
        departureDate: returnOnly
          ? (tripReturn ?? window.start)
          : isFirst
            ? (ctx.departureDate ?? window.start)
            : window.start,
        returnDate: roundTrip ? tripReturn : undefined,
      };

      if (returnOnly && ctx.originIata && ctx.destinationIata) {
        localCtx = {
          ...localCtx,
          originIata: ctx.destinationIata,
          destinationIata: ctx.originIata,
        };
      }
    }

    const calls: ToolCallSpec[] = [];
    for (const need of checkpoint.needs) {
      calls.push(...buildToolCallsForNeed(need, checkpoint, localCtx));
    }
    return { checkpoint, calls };
  });
}
