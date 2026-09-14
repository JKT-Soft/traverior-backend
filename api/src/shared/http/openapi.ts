import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance, FastifySchema } from "fastify";
import type { ZodType } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { createSwaggerBasicAuthHook } from "./swagger-basic-auth.js";

declare module "fastify" {
  interface FastifySchema {
    docs?: {
      body?: Record<string, unknown>;
      params?: Record<string, unknown>;
      querystring?: Record<string, unknown>;
      headers?: Record<string, unknown>;
      response?: Record<string, unknown>;
    };
  }
}

const errorEnvelope = {
  type: "object",
  additionalProperties: true,
  properties: {
    ok: { type: "boolean", enum: [false] },
    error: {
      type: "object",
      additionalProperties: true,
      properties: {
        code: { type: "string" },
        message: { type: "string" },
      },
    },
  },
};

const successEnvelope = {
  type: "object",
  additionalProperties: true,
  properties: {
    ok: { type: "boolean", enum: [true] },
    data: {},
  },
};

export const OPENAPI_TAGS = [
  { name: "Health", description: "Process liveness and provider pings" },
  { name: "Auth", description: "Current user and auth module status" },
  { name: "Flights", description: "Flight search" },
  { name: "Hotels", description: "Hotel search" },
  { name: "Places", description: "Places and restaurants" },
  { name: "Routes", description: "Ground routing" },
  { name: "Weather", description: "Weather forecast" },
  { name: "Events", description: "Local events and activities" },
  { name: "Visa", description: "Visa requirements" },
  { name: "Images", description: "Destination images" },
  { name: "Checklist", description: "Travel checklist" },
  { name: "Trips", description: "Journeys and pipeline nodes" },
  { name: "Planner", description: "LLM skeleton and tool execution" },
  { name: "Profile", description: "User profile and preferences" },
  { name: "Saved places", description: "Bookmarked places" },
] as const;

export function toOpenApiSchema(schema: ZodType): Record<string, unknown> {
  const json = zodToJsonSchema(schema, {
    target: "openApi3",
    $refStrategy: "none",
  }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

export type RouteDocsInput = {
  tags: string[];
  summary: string;
  description?: string;
  body?: ZodType;
  bodyExample?: Record<string, unknown>;
  params?: ZodType;
  paramsExample?: Record<string, unknown>;
  querystring?: ZodType;
  queryExample?: Record<string, unknown>;
  auth?: boolean;
  statusCodes?: number[];
};

function withSchemaExample(
  schema: Record<string, unknown>,
  example?: Record<string, unknown>,
): Record<string, unknown> {
  if (!example) return schema;
  const properties = schema.properties;
  const nextProperties =
    properties && typeof properties === "object" && !Array.isArray(properties)
      ? Object.fromEntries(
          Object.entries(properties as Record<string, Record<string, unknown>>).map(([key, value]) => [
            key,
            example[key] === undefined ? value : { ...value, default: example[key], example: example[key] },
          ]),
        )
      : properties;
  return {
    ...schema,
    ...(nextProperties ? { properties: nextProperties } : {}),
    example,
    default: example,
  };
}

export function routeDocs(input: RouteDocsInput): FastifySchema {
  const auth = input.auth ?? true;
  const statusCodes = input.statusCodes ?? [200];
  const response: Record<string, unknown> = {
    400: errorEnvelope,
    401: errorEnvelope,
    404: errorEnvelope,
  };
  for (const code of statusCodes) {
    response[String(code)] = successEnvelope;
  }

  return {
    tags: input.tags,
    summary: input.summary,
    description: input.description ?? input.summary,
    security: auth ? [{ bearerAuth: [] }] : [],
    docs: {
      ...(input.body ? { body: withSchemaExample(toOpenApiSchema(input.body), input.bodyExample) } : {}),
      ...(input.params ? { params: withSchemaExample(toOpenApiSchema(input.params), input.paramsExample) } : {}),
      ...(input.querystring
        ? { querystring: withSchemaExample(toOpenApiSchema(input.querystring), input.queryExample) }
        : {}),
      response,
    },
  };
}

export function healthDocs(tag: string, module: string): FastifySchema {
  return routeDocs({
    tags: [tag],
    summary: `${module} module health`,
    description: `Returns status for the ${module} module.`,
  });
}

export function mergeOpenApiTransform({
  schema,
  url,
}: {
  schema: FastifySchema;
  url: string;
}): { schema: FastifySchema; url: string } {
  const docs = schema.docs;
  if (!docs) return { schema, url };
  const { docs: _docs, ...rest } = schema;
  return { schema: { ...rest, ...docs }, url };
}

export type SwaggerUiResponse = {
  url?: string;
  status?: number;
  text?: string;
  body?: unknown;
  obj?: unknown;
  data?: unknown;
};

/** Browser-only: serialized into Swagger UI. Must stay self-contained (no imports). */
export function swaggerTestTokenInterceptor(res: SwaggerUiResponse): SwaggerUiResponse {
  try {
    const url = String(res.url ?? "");
    if (!url.includes("/v1/auth/test-token") || res.status !== 200) return res;

    let payload: unknown = res.body ?? res.obj ?? res.data;
    if (typeof payload === "string") payload = JSON.parse(payload);
    else if (payload == null && typeof res.text === "string" && res.text.length > 0) {
      payload = JSON.parse(res.text);
    }

    const data =
      payload && typeof payload === "object" && "data" in payload
        ? (payload as { data?: { idToken?: unknown } }).data
        : undefined;
    const token =
      data && typeof data === "object" && "idToken" in data ? data.idToken : undefined;
    if (typeof token !== "string" || token.length === 0) return res;

    const swagger = (globalThis as { ui?: { preauthorizeApiKey?: (name: string, value: string) => void } }).ui;
    if (swagger && typeof swagger.preauthorizeApiKey === "function") {
      swagger.preauthorizeApiKey("bearerAuth", token);
    }
  } catch {
    // Ignore parse errors so Swagger still shows the raw response.
  }
  return res;
}

export type RegisterOpenApiOptions = {
  basicAuth?: { username: string; password: string };
};

export async function registerOpenApi(
  app: FastifyInstance,
  options: RegisterOpenApiOptions = {},
): Promise<void> {
  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "Traverior API",
        description:
          "Modular monolith for Traverior. Send `Authorization: Bearer <token>` — Firebase ID token, or `dev:<uid>` when AUTH_MODE=dev.",
        version: "0.1.0",
      },
      tags: [...OPENAPI_TAGS],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description:
              "Firebase ID token, or `dev:<firebaseUid>` when AUTH_MODE=dev.",
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
    transform: mergeOpenApiTransform,
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    ...(options.basicAuth
      ? { uiHooks: { onRequest: createSwaggerBasicAuthHook(options.basicAuth) } }
      : {}),
    uiConfig: {
      docExpansion: "list",
      persistAuthorization: true,
      displayRequestDuration: true,
      tryItOutEnabled: true,
      onComplete: function bindSwaggerUi() {
        // `ui` is the SwaggerUIBundle instance created in swagger-initializer.js
        // @ts-expect-error injected by @fastify/swagger-ui
        globalThis.ui = ui;
      },
      responseInterceptor: swaggerTestTokenInterceptor,
    },
  });
}
