import { readJson, ok, handleApiError } from "@/server/api";
import { getWebhookSettings, saveWebhookSettings } from "@/server/db";
import { evaluateAutomation } from "@/server/services/automation";
import { webhookSchema } from "@/server/validation";

export async function GET() {
  try {
    const settings = getWebhookSettings();
    return ok({
      ...settings,
      secret: ""
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const input = webhookSchema.parse(await readJson(request));
    const existing = getWebhookSettings();
    saveWebhookSettings({
      ...existing,
      ...input,
      token: existing.token,
      secret: input.secret || existing.secret
    });
    await evaluateAutomation("webhook settings updated");
    return ok({ saved: true });
  } catch (error) {
    return handleApiError(error);
  }
}
