import { readJson, ok, handleApiError } from "@/server/api";
import { saveMonitoringSettings } from "@/server/db";
import { evaluateAutomation } from "@/server/services/automation";
import { monitoringSchema } from "@/server/validation";

export async function PUT(request: Request) {
  try {
    const input = monitoringSchema.parse(await readJson(request));
    saveMonitoringSettings(input);
    await evaluateAutomation("monitoring settings updated");
    return ok({ saved: true });
  } catch (error) {
    return handleApiError(error);
  }
}
