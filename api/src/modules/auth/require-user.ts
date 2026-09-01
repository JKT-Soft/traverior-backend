import { UnauthorizedError } from "../../shared/http/errors.js";
import type { AuthUser } from "./domain/ports.js";

/** Convenience for route handlers that already have ctx.user */
export function requireUser(user: AuthUser | undefined): AuthUser {
  if (!user) throw new UnauthorizedError();
  return user;
}
