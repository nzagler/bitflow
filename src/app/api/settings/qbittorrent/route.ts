import { readJson, ok, handleApiError } from "@/server/api";
import { MASKED_SECRET_VALUE } from "@/lib/secret-placeholders";
import { getQbittorrentSettings, saveQbittorrentSettings } from "@/server/db";
import { evaluateAutomation } from "@/server/services/automation";
import { qbittorrentSchema } from "@/server/validation";

export async function GET() {
  try {
    const settings = getQbittorrentSettings();
    return ok({
      ...settings,
      apiKey: ""
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const input = qbittorrentSchema.parse(await readJson(request));
    const existing = getQbittorrentSettings();
    saveQbittorrentSettings({
      ...input,
      apiKey: input.apiKey === MASKED_SECRET_VALUE ? existing.apiKey : input.apiKey
    });
    await evaluateAutomation("qBittorrent settings updated");
    return ok({ saved: true });
  } catch (error) {
    return handleApiError(error);
  }
}
