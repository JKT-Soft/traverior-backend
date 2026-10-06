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

export const PLANNING_CONCEPT_VALUES = [
  "culture",
  "entertainment",
  "business",
  "food",
  "family",
] as const;

export const PlanningConceptSchema = z.enum(PLANNING_CONCEPT_VALUES);

export const CheckpointSearchCountsSchema = z.object({
  events: z.number().int().min(0).max(20).optional(),
  restaurants: z.number().int().min(0).max(20).optional(),
  places: z.number().int().min(0).max(20).optional(),
});

export const SkeletonCheckpointSchema = z.object({
  city: z.string().min(1),
  countryCode: z.string().min(2).max(2).optional(),
  airportIata: z.string().regex(/^[A-Za-z]{3}$/).optional(),
  role: z.enum(["STAY", "TRANSIT", "DAY_TRIP"]).default("STAY"),
  days: z.number().int().positive().max(30),
  needs: z.array(CheckpointNeedSchema).default([]),
  search: CheckpointSearchCountsSchema.optional(),
  notes: z.string().optional(),
});

export const TripSkeletonSchema = z.object({
  title: z.string().min(1),
  summary: z.string().optional(),
  concept: PlanningConceptSchema.optional(),
  tone: z.string().optional(),
  originCity: z.string().optional(),
  originIata: z.string().regex(/^[A-Za-z]{3}$/).optional(),
  destinationSummary: z.string().optional(),
  assumedStartDate: z.string().optional(),
  assumedEndDate: z.string().optional(),
  partySize: z.number().int().positive().max(20).optional(),
  budgetTone: z.enum(["budget", "mid", "luxury"]).optional(),
  checkpoints: z.array(SkeletonCheckpointSchema).min(1).max(12),
});

export const PlanPreferencesSchema = z
  .object({
    originCity: z.string().optional(),
    destination: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    dateFlexibility: z.enum(["flexible", "exact"]).optional(),
    partySize: z.number().int().positive().optional(),
    budgetTone: z.enum(["budget", "mid", "luxury"]).optional(),
    pace: z.enum(["relaxed", "moderate", "packed"]).optional(),
    passportCountry: z.string().optional(),
    travelWith: z.string().optional(),
  })
  .optional();

export type CheckpointNeed = z.infer<typeof CheckpointNeedSchema>;
export type CheckpointSearchCounts = z.infer<typeof CheckpointSearchCountsSchema>;
export type PlanningConcept = z.infer<typeof PlanningConceptSchema>;
export type SkeletonCheckpoint = z.infer<typeof SkeletonCheckpointSchema>;
export type TripSkeleton = z.infer<typeof TripSkeletonSchema>;

export type PlanSkeletonInput = {
  prompt: string;
  preferences?: {
    originCity?: string;
    destination?: string;
    startDate?: string;
    endDate?: string;
    dateFlexibility?: "flexible" | "exact";
    partySize?: number;
    budgetTone?: "budget" | "mid" | "luxury";
    pace?: "relaxed" | "moderate" | "packed";
    passportCountry?: string;
    travelWith?: string;
  };
};
