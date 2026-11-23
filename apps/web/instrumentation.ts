import type { Instrumentation } from "next";

/**
 * Server errors → PostHog Error tracking. Next.js calls this when a Server Component, Route
 * Handler or Server Action throws. Only the error and where it happened are sent: the path
 * without its query string, never headers, bodies, message text or keys.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { captureServerException, distinctIdFromHeaders } = await import("./lib/analytics/server");
  await captureServerException(error, distinctIdFromHeaders(request.headers), {
    path: request.path.split("?")[0] ?? request.path,
    method: request.method,
    route_path: context.routePath,
    route_type: context.routeType,
    router_kind: context.routerKind,
  });
};
