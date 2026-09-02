export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = "APP_ERROR",
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(404, message, "NOT_FOUND");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(401, message, "UNAUTHORIZED");
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message, "VALIDATION_ERROR");
  }
}

export class PlanNeedsInputError extends AppError {
  constructor(
    clarifications: unknown[],
    message = "A few details will make this plan bookable.",
  ) {
    super(409, message, "PLAN_NEEDS_INPUT", { clarifications });
    this.name = "PlanNeedsInputError";
  }
}
