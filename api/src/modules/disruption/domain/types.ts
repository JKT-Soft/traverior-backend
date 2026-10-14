import type { AlertSeverity } from "@prisma/client";

export const DISRUPTION_KINDS = ["delay", "weather", "cancel"] as const;
export type DisruptionKind = (typeof DISRUPTION_KINDS)[number] | (string & {});

export type DisruptionCandidate = {
  tripId: string;
  stopId?: string | null;
  kind: DisruptionKind;
  severity: AlertSeverity;
  title: string;
  body: string;
  payload?: Record<string, unknown> | null;
};

export type SerializedTripAlert = {
  id: string;
  tripId: string;
  stopId: string | null;
  kind: string;
  severity: AlertSeverity;
  title: string;
  body: string;
  payload: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
};

export type CheckTripResult = {
  tripId: string;
  scannedStops: number;
  detectedCount: number;
  newAlertsCount: number;
  alerts: SerializedTripAlert[];
};

export type ListAlertsFilter = {
  unreadOnly?: boolean;
  kind?: string;
  limit?: number;
};
