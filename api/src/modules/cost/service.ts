import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../../infra/prisma/client.js";

type CostDb = Pick<PrismaClient, "pipelineNode" | "trip">;

export type TripRollup = {
  totalCostAmount: number;
  totalDurationMinutes: number;
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

/** Deterministic cost/duration roll-up — never use LLM for these numbers */
export class CostService {
  constructor(private readonly db: CostDb = defaultPrisma) {}

  async rollupTrip(tripId: string): Promise<TripRollup> {
    const nodes = await this.db.pipelineNode.findMany({
      where: { tripId, deletedAt: null },
      select: {
        id: true,
        parentId: true,
        costAmount: true,
        durationMinutes: true,
        depth: true,
      },
    });

    if (nodes.length === 0) {
      return { totalCostAmount: 0, totalDurationMinutes: 0 };
    }

    const ownCost = new Map(nodes.map((node) => [node.id, asNumber(node.costAmount)]));
    const ownDuration = new Map(nodes.map((node) => [node.id, node.durationMinutes]));
    const rolledCost = new Map(ownCost);
    const rolledDuration = new Map(ownDuration);

    const byParent = new Map<string | null, typeof nodes>();
    for (const node of nodes) {
      const list = byParent.get(node.parentId) ?? [];
      list.push(node);
      byParent.set(node.parentId, list);
    }

    const maxDepth = nodes.reduce((max, node) => Math.max(max, node.depth), 0);
    for (let depth = maxDepth; depth >= 0; depth -= 1) {
      const level = nodes.filter((node) => node.depth === depth);
      for (const node of level) {
        const children = byParent.get(node.id) ?? [];
        const childCost = children.reduce((sum, child) => sum + (rolledCost.get(child.id) ?? 0), 0);
        const childDuration = children.reduce((sum, child) => sum + (rolledDuration.get(child.id) ?? 0), 0);
        const cost = (ownCost.get(node.id) ?? 0) + childCost;
        const duration = (ownDuration.get(node.id) ?? 0) + childDuration;
        rolledCost.set(node.id, cost);
        rolledDuration.set(node.id, duration);

        if (children.length === 0 && cost === asNumber(node.costAmount) && duration === node.durationMinutes) {
          continue;
        }

        await this.db.pipelineNode.update({
          where: { id: node.id },
          data: {
            costAmount: cost,
            durationMinutes: duration,
            costIsEstimate: true,
          },
        });
      }
    }

    const root = nodes.find((node) => node.parentId === null);
    const totalCostAmount = root ? (rolledCost.get(root.id) ?? 0) : 0;
    const totalDurationMinutes = root ? (rolledDuration.get(root.id) ?? 0) : 0;

    if (root) {
      await this.db.trip.update({
        where: { id: tripId },
        data: {
          totalCostAmount,
          totalDurationMinutes,
          totalCostIsEstimate: true,
        },
      });
    }

    return { totalCostAmount, totalDurationMinutes };
  }
}
