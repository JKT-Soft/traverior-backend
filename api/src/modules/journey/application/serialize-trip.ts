/** Prisma Decimal / cache round-trip → a JSON number Fastify can send. */
export function moneyToNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value.replaceAll(",", ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (!value || typeof value !== "object") return 0;

  const row = value as {
    toNumber?: unknown;
    toFixed?: unknown;
    amount?: unknown;
    d?: unknown;
    e?: unknown;
    s?: unknown;
  };

  if (typeof row.toNumber === "function") {
    const n = (row.toNumber as () => number)();
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof row.toFixed === "function") {
    const n = Number((row.toFixed as () => string)());
    return Number.isFinite(n) ? n : 0;
  }
  if ("amount" in row) return moneyToNumber(row.amount);
  if (Array.isArray(row.d) && typeof row.e === "number") {
    return decimalJsToNumber({ d: row.d, e: row.e, s: row.s });
  }
  return 0;
}

function decimalJsToNumber(row: { d: unknown; e: unknown; s?: unknown }): number {
  const digits = row.d;
  if (!Array.isArray(digits) || typeof row.e !== "number") return 0;

  const chunks: string[] = [];
  for (const item of digits) {
    if (typeof item !== "number" || !Number.isFinite(item)) return 0;
    const chunk = String(Math.trunc(Math.abs(item)));
    chunks.push(chunks.length === 0 ? chunk : chunk.padStart(7, "0"));
  }

  const digitStr = chunks.join("").replace(/^0+(?=\d)/, "") || "0";
  const scale = row.e - (digitStr.length - 1);
  const magnitude = Number(digitStr) * 10 ** scale;
  const sign = typeof row.s === "number" && row.s < 0 ? -1 : 1;
  return Number.isFinite(magnitude) ? sign * magnitude : 0;
}

export function serializeTripNode<T extends { costAmount?: unknown }>(node: T): T & { costAmount: number } {
  return { ...node, costAmount: moneyToNumber(node.costAmount) };
}

export function serializeTrip<
  T extends { totalCostAmount?: unknown; nodes?: Array<{ costAmount?: unknown }> },
>(trip: T): T & { totalCostAmount: number } {
  return {
    ...trip,
    totalCostAmount: moneyToNumber(trip.totalCostAmount),
    ...(trip.nodes ? { nodes: trip.nodes.map(serializeTripNode) } : {}),
  };
}
