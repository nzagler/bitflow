import { readJson, ok, handleApiError } from "@/server/api";
import { MASKED_SECRET_VALUE } from "@/lib/secret-placeholders";
import { getBackrestSettings, saveBackrestSettings } from "@/server/db";
import { evaluateAutomation } from "@/server/services/automation";
import { backrestSchema } from "@/server/validation";

export async function PUT(request: Request) {
  try {
    const input = backrestSchema.parse(await readJson(request));
    const existing = getBackrestSettings();
    saveBackrestSettings({ ...input, password: input.password === MASKED_SECRET_VALUE ? existing.password : input.password });
    await evaluateAutomation("Backrest settings updated");
    return ok({ saved: true });
  } catch (error) { return handleApiError(error); }
}
