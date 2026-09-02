import { ProfileService } from "./application/service.js";
import { createProfileRoutes } from "./http/routes.js";

export function createProfileModule(db?: ConstructorParameters<typeof ProfileService>[0]) {
  const service = new ProfileService(db);
  return { service, routes: createProfileRoutes(service) };
}

export { ProfileService, serializeProfile } from "./application/service.js";
export type { ProfilePreferencesInput, UpdateProfileInput } from "./application/service.js";
