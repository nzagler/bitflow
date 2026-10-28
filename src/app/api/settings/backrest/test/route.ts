import { readJson, ok, handleApiError } from "@/server/api";
import { MASKED_SECRET_VALUE } from "@/lib/secret-placeholders";
import { getBackrestSettings } from "@/server/db";
import { queryBackrest } from "@/server/services/backrest";
import { backrestSchema } from "@/server/validation";

export async function POST(request: Request) {
  try {
    const input = backrestSchema.parse(await readJson(request));
    if (!input.baseUrl) throw new Error("Backrest URL is required");
    const active = await queryBackrest({ ...input, password: input.password === MASKED_SECRET_VALUE ? getBackrestSettings().password : input.password });
    return ok({ message: active ? "Connected; backup is running" : "Connected; no backup is running" });
  } catch (error) { return handleApiError(error); }
}
