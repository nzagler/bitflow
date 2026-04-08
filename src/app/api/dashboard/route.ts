import { ok, handleApiError } from "@/server/api";
import { buildDashboardSnapshot } from "@/server/db";

export async function GET() {
  try {
    return ok(buildDashboardSnapshot());
  } catch (error) {
    return handleApiError(error);
  }
}
