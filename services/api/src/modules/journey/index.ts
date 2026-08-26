import { JourneyService } from "./application/service.js";
import { createJourneyRoutes } from "./http/routes.js";

export function createJourneyModule(db?: ConstructorParameters<typeof JourneyService>[0]) {
  const service = new JourneyService(db);
  return { service, routes: createJourneyRoutes(service) };
}
