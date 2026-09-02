export function imageUrlFromContent(content: unknown): string | null {
  if (!content || typeof content !== "object" || Array.isArray(content)) return null;
  const record = content as Record<string, unknown>;
  for (const key of ["thumbnailUrl", "imageUrl", "thumbUrl"]) {
    const value = record[key];
    if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  }
  return null;
}

export function coverImageUrlFromNodes(
  nodes:
    | Array<{
        type?: string;
        checkpointKind?: string | null;
        content?: unknown;
      }>
    | undefined,
): string | null {
  if (!nodes?.length) return null;
  const checkpoints = nodes.filter((node) => node.type === "CHECKPOINT");
  const stays = checkpoints.filter(
    (node) => node.checkpointKind === "STAY" || node.checkpointKind == null,
  );
  for (const node of stays.length > 0 ? stays : checkpoints) {
    const url = imageUrlFromContent(node.content);
    if (url) return url;
  }
  return null;
}

export function coverLocationFromTrip(trip: {
  title: string;
  destinationSummary?: string | null;
  nodes?: Array<{ type?: string; checkpointKind?: string | null; title?: string }>;
}): string | null {
  const stay = trip.nodes?.find(
    (node) => node.type === "CHECKPOINT" && (node.checkpointKind === "STAY" || node.checkpointKind == null),
  );
  const stayTitle = stay?.title?.trim();
  if (stayTitle && stayTitle.toLowerCase() !== "destination") return stayTitle;

  const summary = trip.destinationSummary?.split(/[•→,|-]/)[0]?.trim();
  if (summary && summary.toLowerCase() !== "primary destination") return summary;

  return null;
}
