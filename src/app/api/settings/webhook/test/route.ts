import { ok, handleApiError } from "@/server/api";
import { registerWebhookActivity } from "@/server/services/automation";

export async function POST() {
  try {
    await registerWebhookActivity({ source: "manual test" });
    return ok({ received: true });
  } catch (error) {
    return handleApiError(error);
  }
}
