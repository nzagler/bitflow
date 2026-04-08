import { ok, handleApiError } from "@/server/api";
import { buildDashboardSnapshot } from "@/server/db";

function getRequestOrigin(request: Request) {
  const url = new URL(request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");

  if (forwardedHost) {
    return `${forwardedProto ?? url.protocol.replace(":", "")}://${forwardedHost}`;
  }

  return url.origin;
}

export async function GET(request: Request) {
  try {
    return ok(buildDashboardSnapshot(getRequestOrigin(request)));
  } catch (error) {
    return handleApiError(error);
  }
}
