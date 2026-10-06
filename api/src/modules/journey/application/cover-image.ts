type CoverMedia = {
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  role?: string | null;
};

type CoverStop = {
  kind?: string | null;
  name?: string | null;
  city?: string | null;
  medias?: CoverMedia[] | null;
};

function imageUrlFromMedia(media: CoverMedia | undefined): string | null {
  if (!media) return null;
  for (const value of [media.thumbnailUrl, media.imageUrl]) {
    if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  }
  return null;
}

export function imageUrlFromContent(content: unknown): string | null {
  if (!content || typeof content !== "object" || Array.isArray(content)) return null;
  const record = content as Record<string, unknown>;
  for (const key of ["thumbnailUrl", "imageUrl", "thumbUrl"]) {
    const value = record[key];
    if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  }
  return null;
}

export function coverImageUrlFromStops(stops: CoverStop[] | undefined): string | null {
  if (!stops?.length) return null;
  const stays = stops.filter((stop) => stop.kind === "stay" || stop.kind == null);
  const ordered = stays.length > 0 ? stays : stops.filter((stop) => stop.kind !== "travel");
  for (const stop of ordered.length > 0 ? ordered : stops) {
    const cover = stop.medias?.find((media) => media.role === "cover") ?? stop.medias?.[0];
    const url = imageUrlFromMedia(cover);
    if (url) return url;
  }
  return null;
}

export function coverLocationFromTrip(trip: {
  title: string;
  destinationSummary?: string | null;
  journey?: { stops?: CoverStop[] | null } | null;
}): string | null {
  const stay = trip.journey?.stops?.find((stop) => stop.kind === "stay" || stop.kind == null);
  const stayName = (stay?.city ?? stay?.name)?.trim();
  if (stayName && stayName.toLowerCase() !== "destination") return stayName;

  const summary = trip.destinationSummary?.split(/[•→,|-]/)[0]?.trim();
  if (summary && summary.toLowerCase() !== "primary destination") return summary;

  return null;
}
