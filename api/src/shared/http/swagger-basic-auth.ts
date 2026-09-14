import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

export const SWAGGER_BASIC_REALM = 'Basic realm="Traverior API docs", charset="UTF-8"';

export function swaggerBasicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

export function parseBasicAuthHeader(
  header: string | string[] | undefined,
): { username: string; password: string } | null {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return null;
  const match = /^Basic\s+(\S+)$/i.exec(raw.trim());
  if (!match) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(match[1], "base64").toString("utf8");
  } catch {
    return null;
  }
  const colon = decoded.indexOf(":");
  if (colon < 0) return null;
  return { username: decoded.slice(0, colon), password: decoded.slice(colon + 1) };
}

function digestEqual(left: string, right: string): boolean {
  const a = createHash("sha256").update(left).digest();
  const b = createHash("sha256").update(right).digest();
  return timingSafeEqual(a, b);
}

export function credentialsMatch(
  parsed: { username: string; password: string },
  expected: { username: string; password: string },
): boolean {
  return digestEqual(parsed.username, expected.username) && digestEqual(parsed.password, expected.password);
}

export function createSwaggerBasicAuthHook(expected: { username: string; password: string }) {
  return async function swaggerBasicAuth(req: FastifyRequest, reply: FastifyReply) {
    const parsed = parseBasicAuthHeader(req.headers.authorization);
    if (!parsed || !credentialsMatch(parsed, expected)) {
      reply.header("WWW-Authenticate", SWAGGER_BASIC_REALM);
      return reply.code(401).send({
        ok: false,
        error: { code: "UNAUTHORIZED", message: "Swagger basic auth required" },
      });
    }
  };
}
