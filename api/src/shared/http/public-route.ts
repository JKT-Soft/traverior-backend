/** Liveness, Swagger UI, and the test-token helper skip Firebase/dev Bearer auth.
 *  `/docs` may still require HTTP Basic Auth when SWAGGER_BASIC_* is set. */
export function isPublicRoute(method: string, url: string): boolean {
  const path = url.split("?")[0];
  if (path === "/v1/auth/test-token") return method === "POST";
  if (method !== "GET" && method !== "HEAD") return false;
  return path === "/health" || path === "/docs" || path.startsWith("/docs/");
}