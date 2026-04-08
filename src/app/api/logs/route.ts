import { ok, handleApiError } from "@/server/api";
import { getLogs } from "@/server/db";

export async function GET() {
  try {
    return ok(getLogs());
  } catch (error) {
    return handleApiError(error);
  }
}
