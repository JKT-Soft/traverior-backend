import { z } from "zod";

export const NEED_VALUES = [
  "flights",
  "hotels",
  "places",
  "routes",
  "weather",
  "events",
  "visa",
  "checklist",
] as const;

export const CheckpointNeedSchema = z.enum(NEED_VALUES);

export const SkeletonCheckpointSchema = z.object({
  city: z.string().min(1),
  countryCode: z.string().min(2).max(2).optional(),
  role: z.enum(["STAY", "TRANSIT", "DAY_TRIP"]).default("STAY"),
  days: z.number().int().positive().max(30),
  needs: z.array(CheckpointNeedSchema).default([]),
  notes: z.string().optional(),
});

export const TripSkeletonSchema = z.object({
  title: z.string().min(1),
  summary: z.string().optional(),
  originCity: z.string().optional(),
  destinationSummary: z.string().optional(),
  assumedStartDate: z.string().optional(),
  assumedEndDate: z.string().optional(),
  partySize: z.number().int().positive().max(20).optional(),
  budgetTone: z.enum(["budget", "mid", "luxury"]).optional(),
  checkpoints: z.array(SkeletonCheckpointSchema).min(1).max(12),
});

export type CheckpointNeed = z.infer<typeof CheckpointNeedSchema>;
export type SkeletonCheckpoint = z.infer<typeof SkeletonCheckpointSchema>;
export type TripSkeleton = z.infer<typeof TripSkeletonSchema>;

export type PlanSkeletonInput = {
  prompt: string;
  preferences?: {
    originCity?: string;
    startDate?: string;
    endDate?: string;
    partySize?: number;
    budgetTone?: "budget" | "mid" | "luxury";
    pace?: "relaxed" | "moderate" | "packed";
    passportCountry?: string;
  };
};
