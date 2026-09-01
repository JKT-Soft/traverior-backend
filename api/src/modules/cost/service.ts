import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../../infra/prisma/client.js";

type CostDb = Pick<PrismaClient, "pipelineNode" | "trip">;

/** Deterministic cost/duration roll-up — never use LLM for these numbers */
export class CostService {
  constructor(private readonly db: CostDb = defaultPrisma) {}

  async rollupTrip(tripId: string) {
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

    const byParent = new Map<string | null, typeof nodes>();
    for (const node of nodes) {
      const key = node.parentId;
      const list = byParent.get(key) ?? [];
      list.push(node);
      byParent.set(key, list);
    }

    const maxDepth = nodes.reduce((m, n) => Math.max(m, n.depth), 0);
    for (let depth = maxDepth; depth >= 0; depth -= 1) {
      const level = nodes.filter((n) => n.depth === depth);
      for (const node of level) {
        const children = byParent.get(node.id) ?? [];
        if (children.length === 0) continue;
        const cost = children.reduce((s, c) => s + Number(c.costAmount), 0);
        const duration = children.reduce((s, c) => s + c.durationMinutes, 0);
        await this.db.pipelineNode.update({
          where: { id: node.id },
          data: {
            costAmount: cost,
            durationMinutes: duration,
            costIsEstimate: true,
          },
        });
        node.costAmount = cost as unknown as typeof node.costAmount;
        node.durationMinutes = duration;
      }
    }

    const root = nodes.find((n) => n.parentId === null);
    if (root) {
      await this.db.trip.update({
        where: { id: tripId },
        data: {
          totalCostAmount: Number(root.costAmount),
          totalDurationMinutes: root.durationMinutes,
          totalCostIsEstimate: true,
        },
      });
    }
  }
}
