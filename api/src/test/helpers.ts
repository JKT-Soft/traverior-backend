import type { IncomingMessage } from "node:http";
import type { FastifyInstance, FastifyPluginAsync, LightMyRequestResponse } from "fastify";
import { buildApp } from "../shared/http/app.js";

export function mockReq(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    method: "GET",
    url: "/",
    headers: {},
    ...overrides,
  } as IncomingMessage;
}

export async function buildTestApp(
  plugin: FastifyPluginAsync,
  options: {
    prefix?: string;
    user?: { uid: string; email?: string };
  } = {},
): Promise<FastifyInstance> {
  const app = buildApp({
    auth: options.user
      ? async () => options.user
      : undefined,
  });
  await app.register(plugin, { prefix: options.prefix ?? "" });
  await app.ready();
  return app;
}

export async function injectJson(
  app: FastifyInstance,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  options: {
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Promise<LightMyRequestResponse> {
  const response = await app.inject({
    method,
    url,
    headers: {
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      ...options.headers,
    },
    ...(options.body !== undefined ? { payload: options.body as object | string } : {}),
  });
  return response;
}

export function baseEnv(overrides: Record<string, string> = {}) {
  return {
    PORT: "3000",
    NODE_ENV: "test",
    AUTH_MODE: "dev",
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    PROVIDER_FLIGHTS: "mock",
    PROVIDER_HOTELS: "mock",
    PROVIDER_PLACES: "mock",
    PROVIDER_ROUTES: "mock",
    PROVIDER_WEATHER: "mock",
    PROVIDER_EVENTS: "mock",
    PROVIDER_VISA: "static",
    PROVIDER_IMAGES: "mock",
    ...overrides,
  };
}

export type MockFn<T extends (...args: never[]) => unknown = (...args: never[]) => unknown> = T & {
  mock: {
    calls: unknown[][];
    clear(): void;
  };
};

export function createMockFn<T extends (...args: never[]) => unknown>(impl?: T): MockFn<T> {
  const calls: unknown[][] = [];
  const fn = ((...args: never[]) => {
    calls.push(args);
    return impl ? impl(...(args as Parameters<T>)) : undefined;
  }) as MockFn<T>;
  fn.mock = {
    get calls() {
      return calls;
    },
    clear() {
      calls.length = 0;
    },
  };
  return fn;
}

export function stubFetch(impl: typeof fetch): () => void {
  const previous = globalThis.fetch;
  globalThis.fetch = impl;
  return () => {
    globalThis.fetch = previous;
  };
}
