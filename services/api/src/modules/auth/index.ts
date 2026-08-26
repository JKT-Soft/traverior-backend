import type { Env } from "../../config/env.js";
import type { AuthResolver } from "../../shared/http/app.js";
import { AuthService } from "./application/service.js";
import type { AuthProvider } from "./domain/ports.js";
import { createAuthRoutes } from "./http/routes.js";
import { DevAuthProvider } from "./infra/dev-provider.js";
import { FirebaseAuthProvider } from "./infra/firebase-provider.js";

export function createAuthProvider(env: Env): AuthProvider {
  switch (env.authMode) {
    case "firebase":
      return new FirebaseAuthProvider(env.firebaseProjectId);
    case "dev":
      return new DevAuthProvider();
    default:
      throw new Error(`Unknown AUTH_MODE: ${env.authMode}`);
  }
}

export function createAuthModule(env: Env) {
  const provider = createAuthProvider(env);
  const service = new AuthService(provider);
  const resolveAuth: AuthResolver = (req) => service.resolve(req);

  return {
    service,
    routes: createAuthRoutes(service),
    resolveAuth,
  };
}

export { AuthService } from "./application/service.js";
export type { AuthUser, AuthProvider } from "./domain/ports.js";
export { requireUser } from "./require-user.js";
