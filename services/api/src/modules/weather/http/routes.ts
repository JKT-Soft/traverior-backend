import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ValidationError } from "../../../shared/http/errors.js";
import { ok } from "../../../shared/http/reply.js";
import type { WeatherService } from "../application/service.js";

export function createWeatherRoutes(service: WeatherService): FastifyPluginAsync {
  return async (app) => {
    app.get("/health", async (_req, reply) => {
      return ok(reply, { module: "weather", provider: service.providerName });
    });

    app.post("/forecast", async (req, reply) => {
      const parsed = z.object({ lat: z.number(), lon: z.number() }).safeParse(req.body);
      if (!parsed.success) throw new ValidationError("Invalid body");
      return ok(reply, {
        provider: service.providerName,
        forecast: await service.getForecast(parsed.data),
      });
    });
  };
}
