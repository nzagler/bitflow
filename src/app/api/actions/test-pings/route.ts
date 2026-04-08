import { ok, handleApiError } from "@/server/api";
import { addLog } from "@/server/db";
import { restartAutomationTimers } from "@/server/services/automation";

export async function POST() {
  try {
    await restartAutomationTimers();
    addLog("info", "manual_ping_cycle", "Manual ping cycle requested");
    return ok({ refreshed: true });
  } catch (error) {
    return handleApiError(error);
  }
}
