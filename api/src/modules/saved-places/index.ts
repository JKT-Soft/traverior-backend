import { SavedPlaceService } from "./application/service.js";
import { createSavedPlaceRoutes } from "./http/routes.js";

export function createSavedPlaceModule(
  db?: ConstructorParameters<typeof SavedPlaceService>[0],
) {
  const service = new SavedPlaceService(db);
  return { service, routes: createSavedPlaceRoutes(service) };
}

export { SavedPlaceService, serializeSavedPlace } from "./application/service.js";
export type {
  ListSavedPlacesQuery,
  SavePlaceInput,
  UpdateSavedPlaceInput,
} from "./application/service.js";
