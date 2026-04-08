import { fail, ok, handleApiError } from "@/server/api";
import { getWebhookSettings } from "@/server/db";
import { registerWebhookActivity } from "@/server/services/automation";

function validateSecret(request: Request, secret: string) {
  if (!secret) {
    return true;
  }

  const headerSecret = request.headers.get("x-bitflow-secret") ?? request.headers.get("x-jellyfin-secret") ?? "";
  return headerSecret === secret;
}

async function handleWebhook(request: Request, params: { token: string }) {
  const settings = getWebhookSettings();
  if (!settings.enabled) {
    return fail("Webhook handling is disabled", 403);
  }

  if (params.token !== settings.token) {
    return fail("Webhook token mismatch", 404);
  }

  if (!validateSecret(request, settings.secret)) {
    return fail("Webhook secret mismatch", 401);
  }

  let payload: unknown = null;
  try {
    payload = await request.json();
  } catch {
    payload = { note: "No JSON payload" };
  }

  await registerWebhookActivity(payload);
  return ok({ received: true });
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    return handleWebhook(request, await context.params);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    return handleWebhook(request, await context.params);
  } catch (error) {
    return handleApiError(error);
  }
}
