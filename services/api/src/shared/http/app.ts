import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
  type FastifyBaseLogger,
} from "fastify";
import type { IncomingMessage } from "node:http";
import type { Logger } from "pino";
import { AppError, UnauthorizedError } from "./errors.js";
import { isPublicRoute } from "./public-route.js";
import { fail } from "./reply.js";

export type AuthUser = { uid: string; email?: string };

export type AuthResolver = (
  req: IncomingMessage,
) => Promise<AuthUser | undefined>;

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export type BuildAppOptions = {
  auth?: AuthResolver;
  /** Reject unauthenticated requests except GET /health. */
  requireAuth?: boolean;
  /** false = silent; true = default pino stdout; Logger = custom (e.g. file logger) */
  logger?: boolean | Logger | FastifyBaseLogger;
  /** When true, 500 responses include err.message (dev only). */
  exposeErrorDetails?: boolean;
};

function formatError(err: unknown): {
  name: string;
  message: string;
  stack?: string;
  statusCode?: number;
  code?: string;
} {
  if (err instanceof AppError) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      statusCode: err.status,
      code: err.code,
    };
  }
  if (err instanceof Error) {
    const maybe = err as Error & { statusCode?: number; code?: string };
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      statusCode: maybe.statusCode,
      code: maybe.code,
    };
  }
  return { name: "UnknownError", message: String(err) };
}

function logRequestError(
  app: FastifyInstance,
  req: FastifyRequest,
  err: unknown,
  level: "warn" | "error",
) {
  const details = formatError(err);
  const line = {
    method: req.method,
    url: req.url,
    statusCode: details.statusCode,
    code: details.code,
    name: details.name,
    message: details.message,
    stack: details.stack,
  };

  // Human-readable console line (useful in `npm run dev` terminal)
  const prefix = level === "error" ? "[traverior-api:error]" : "[traverior-api:warn]";
  console[level](prefix, {
    method: line.method,
    url: line.url,
    statusCode: line.statusCode,
    code: line.code,
    name: line.name,
    message: line.message,
  });
  if (details.stack) console[level](details.stack);

  // Structured log → console + files (when file logger is configured)
  if (level === "error") {
    app.log.error({ err, req: line }, details.message);
  } else {
    app.log.warn({ err, req: line }, details.message);
  }
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const exposeErrorDetails = options.exposeErrorDetails ?? false;
  const loggerOpt = options.logger ?? false;

  // Fastify 5: boolean/config → `logger`; prebuilt pino → `loggerInstance`
  const app = (
    typeof loggerOpt === "object" && loggerOpt !== null
      ? Fastify({ loggerInstance: loggerOpt as Logger })
      : Fastify({ logger: Boolean(loggerOpt) })
  ) as FastifyInstance;

  app.setErrorHandler((err: unknown, req, reply) => {
    if (err instanceof AppError) {
      logRequestError(app, req, err, err.status >= 500 ? "error" : "warn");
      return fail(reply, err.status, err.code, err.message);
    }

    const maybe = err as { statusCode?: number; message?: string };
    const statusCode =
      typeof maybe.statusCode === "number" ? maybe.statusCode : undefined;
    if (statusCode === 400) {
      logRequestError(app, req, err, "warn");
      return fail(
        reply,
        400,
        "INVALID_JSON",
        maybe.message || "Invalid JSON body",
      );
    }

    logRequestError(app, req, err, "error");
    const message =
      exposeErrorDetails && err instanceof Error && err.message
        ? err.message
        : "Unexpected server error";
    return fail(reply, 500, "INTERNAL_ERROR", message);
  });

  app.setNotFoundHandler((req, reply) => {
    const line = {
      method: req.method,
      url: req.url,
      statusCode: 404,
      code: "NOT_FOUND",
      message: "No route for request",
    };
    console.warn("[traverior-api:warn]", line);
    req.log.warn(line, "No route for request");
    return fail(reply, 404, "NOT_FOUND", "No route for request");
  });

  if (options.auth) {
    const resolveAuth = options.auth;
    app.addHook("onRequest", async (req) => {
      req.user = await resolveAuth(req.raw);
    });
  }

  if (options.requireAuth) {
    app.addHook("preHandler", async (req) => {
      if (isPublicRoute(req.method, req.url)) return;
      if (!req.user) throw new UnauthorizedError();
    });
  }

  return app;
}

export type { FastifyInstance, FastifyReply, FastifyRequest };
