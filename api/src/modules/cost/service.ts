import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../../infra/prisma/client.js";

type CostDb = Pick<PrismaClient, "stop" | "trip" | "budget">;

export type TripRollup = {
  totalCostAmount: number;
  totalDurationMinutes: number;
};

type RollupStop = {
  id: string;
  parentStopId: string | null;
  depth: number;
  days: number | null;
  bookings: Array<{
    kind: string;
    costAmount: unknown;
    flight: { durationMinutes: number | null } | null;
  }>;
};

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") {
    return value.toNumber();
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function ownCost(stop: RollupStop): number {
  return stop.bookings.reduce((sum, booking) => sum + asNumber(booking.costAmount), 0);
}

function ownDuration(stop: RollupStop): number {
  const stay = (stop.days ?? 0) * 24 * 60;
  const flights = stop.bookings.reduce(
    (sum, booking) => sum + (booking.flight?.durationMinutes ?? 0),
    0,
  );
  return stay + flights;
}

/** Deterministic cost/duration roll-up from bookings and nested stops. */
export class CostService {
  constructor(private readonly db: CostDb = defaultPrisma) {}

  async rollupTrip(tripId: string): Promise<TripRollup> {
    const [trip, stops] = await Promise.all([
      this.db.trip.findUnique({ where: { id: tripId }, select: { baseCurrency: true } }),
      this.db.stop.findMany({
        where: { journey: { tripId }, deletedAt: null },
        select: {
          id: true,
          parentStopId: true,
          depth: true,
          days: true,
          bookings: {
            select: {
              kind: true,
              costAmount: true,
              flight: { select: { durationMinutes: true } },
            },
          },
        },
      }),
    ]);

    if (stops.length === 0) {
      return { totalCostAmount: 0, totalDurationMinutes: 0 };
    }

    const currency = trip?.baseCurrency ?? "IDR";
    const rolledCost = new Map(stops.map((stop) => [stop.id, ownCost(stop)]));
    const rolledDuration = new Map(stops.map((stop) => [stop.id, ownDuration(stop)]));
    const byParent = new Map<string | null, typeof stops>();
    for (const stop of stops) {
      const list = byParent.get(stop.parentStopId) ?? [];
      list.push(stop);
      byParent.set(stop.parentStopId, list);
    }

    const maxDepth = stops.reduce((max, stop) => Math.max(max, stop.depth), 0);
    for (let depth = maxDepth; depth >= 0; depth -= 1) {
      for (const stop of stops.filter((item) => item.depth === depth)) {
        const children = byParent.get(stop.id) ?? [];
        const cost =
          (rolledCost.get(stop.id) ?? 0) +
          children.reduce((sum, child) => sum + (rolledCost.get(child.id) ?? 0), 0);
        const duration =
          (rolledDuration.get(stop.id) ?? 0) +
          children.reduce((sum, child) => sum + (rolledDuration.get(child.id) ?? 0), 0);
        rolledCost.set(stop.id, cost);
        rolledDuration.set(stop.id, duration);
      }
    }

    await this.db.budget.deleteMany({
      where: {
        OR: [{ tripId }, { journey: { tripId } }, { stop: { journey: { tripId } } }],
      },
    });

    for (const stop of stops) {
      await this.db.budget.create({
        data: {
          stopId: stop.id,
          scope: "stop",
          category: "total",
          amount: rolledCost.get(stop.id) ?? 0,
          currency,
          isEstimate: true,
        },
      });
    }

    const roots = stops.filter((stop) => stop.parentStopId == null);
    const totalCostAmount = roots.reduce((sum, stop) => sum + (rolledCost.get(stop.id) ?? 0), 0);
    const totalDurationMinutes = roots.reduce((sum, stop) => sum + (rolledDuration.get(stop.id) ?? 0), 0);

    await this.db.budget.create({
      data: {
        tripId,
        scope: "trip",
        category: "total",
        amount: totalCostAmount,
        currency,
        isEstimate: true,
      },
    });
    await this.db.trip.update({
      where: { id: tripId },
      data: {
        totalCostAmount,
        totalDurationMinutes,
        totalCostIsEstimate: true,
      },
    });

    return { totalCostAmount, totalDurationMinutes };
  }
}
