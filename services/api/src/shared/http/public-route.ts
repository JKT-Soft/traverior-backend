/** Only liveness stays public so Docker / load balancers can probe the process. */
export function isPublicRoute(method: string, url: string): boolean {
  const path = url.split("?")[0];
  return method === "GET" && path === "/health";
}
