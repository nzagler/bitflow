import { readJson, ok, handleApiError } from "@/server/api";
import { saveAutomationSettings } from "@/server/db";
import { restartAutomationTimers } from "@/server/services/automation";
import { automationSchema } from "@/server/validation";

export async function PUT(request: Request) {
  try {
    const input = automationSchema.parse(await readJson(request));
    saveAutomationSettings(input);
    await restartAutomationTimers();
    return ok({ saved: true });
  } catch (error) {
    return handleApiError(error);
  }
}
