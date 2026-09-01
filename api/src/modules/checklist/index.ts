import { ChecklistService } from "./application/service.js";
import { createChecklistRoutes } from "./http/routes.js";
import { TemplateChecklistProvider } from "./infra/template-provider.js";

export function createChecklistModule() {
  const service = new ChecklistService(new TemplateChecklistProvider());
  return { service, routes: createChecklistRoutes(service) };
}
