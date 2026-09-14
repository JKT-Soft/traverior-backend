import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ValidationError } from "../../../shared/http/errors.js";
import { healthDocs, routeDocs } from "../../../shared/http/openapi.js";
import { SAMPLE_OSAKA } from "../../../shared/http/openapi-examples.js";
import { ok } from "../../../shared/http/reply.js";
import type { WeatherService } from "../application/service.js";

const forecastSchema = z.object({ lat: z.number(), lon: z.number() });

export function createWeatherRoutes(service: WeatherService): FastifyPluginAsync {
  return async (app) => {
    app.get("/health", { schema: healthDocs("Weather", "weather") }, async (_req, reply) => {
      return ok(reply, { module: "weather", provider: service.providerName });
    });

    app.post(
      "/forecast",
      {
        schema: routeDocs({
          tags: ["Weather"],
          summary: "Weather forecast",
          description: "Forecast for a latitude / longitude.",
          body: forecastSchema,
          bodyExample: { lat: SAMPLE_OSAKA.lat, lon: SAMPLE_OSAKA.lng },
        }),
      },
      async (req, reply) => {
        const parsed = forecastSchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError("Invalid body");
        return ok(reply, {
          provider: service.providerName,
          forecast: await service.getForecast(parsed.data),
        });
      },
    );
  };
}
