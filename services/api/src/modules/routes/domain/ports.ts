import type { ProviderMeta } from "../../../shared/types/provider.js";

export type RouteQuery = {
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
  mode?: "DRIVE" | "WALK" | "BICYCLE" | "TRANSIT";
  languageCode?: string;
};

export type RouteResult = ProviderMeta & {
  contentType: "route";
  mode: string;
  durationMinutes: number;
  distanceMeters: number;
  stepsSummary: string[];
};

export interface RouteProvider {
  readonly name: string;
  getRoute(query: RouteQuery): Promise<RouteResult>;
}
