import type { Env } from "../../config/env.js";
import type { CacheStore } from "../../shared/cache/index.js";
import { ImageService } from "./application/service.js";
import type { ImageProvider } from "./domain/ports.js";
import { createImageRoutes } from "./http/routes.js";
import { MockImageProvider } from "./infra/mock-provider.js";
import { createUnsplashImageProvider } from "./infra/unsplash-provider.js";

export function createImageProvider(env: Env): ImageProvider {
  switch (env.providers.images) {
    case "unsplash":
      return createUnsplashImageProvider(env);
    case "mock":
      return new MockImageProvider();
    default:
      throw new Error(`Unknown PROVIDER_IMAGES: ${env.providers.images}`);
  }
}

export function createImageModule(env: Env, cache?: CacheStore) {
  const service = new ImageService(createImageProvider(env), {
    cache,
    ttlSeconds: env.cache.ttl.images,
  });
  return { service, routes: createImageRoutes(service) };
}

export { ImageService } from "./application/service.js";
export type { ImageProvider, LocationImage, LocationImageQuery } from "./domain/ports.js";
