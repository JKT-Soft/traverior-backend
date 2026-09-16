export const APPLICATION_LOG_TYPE = {
  GENERAL: "GENERAL",
  PLAN_PROCESS: "PLAN_PROCESS",
  PLAN_SKELETON: "PLAN_SKELETON",
  API_REQUEST: "API_REQUEST",
  PROVIDER_REQUEST: "PROVIDER_REQUEST",
  BACKGROUND_JOB: "BACKGROUND_JOB",
  AUTH: "AUTH",
} as const;

export type ApplicationLogType =
  (typeof APPLICATION_LOG_TYPE)[keyof typeof APPLICATION_LOG_TYPE];

export const APPLICATION_LOG_STATUS = {
  STARTED: "started",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

export type ApplicationLogStatus =
  (typeof APPLICATION_LOG_STATUS)[keyof typeof APPLICATION_LOG_STATUS];
