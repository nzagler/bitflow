import { ok, handleApiError, readJson } from "@/server/api";
import { MASKED_SECRET_VALUE } from "@/lib/secret-placeholders";
import { addLog, getQbittorrentSettings } from "@/server/db";
import { testQbittorrentConnection, testQbittorrentConnectionWithSettings } from "@/server/services/qbittorrent";
import { qbittorrentSchema } from "@/server/validation";

export async function POST(request: Request) {
  try {
    let version: string;
    try {
      const input = qbittorrentSchema.partial().parse(await readJson(request));
      const existing = getQbittorrentSettings();
      version = await testQbittorrentConnectionWithSettings({
        hostUrl: input.hostUrl ?? existing.hostUrl,
        urlBase: input.urlBase ?? existing.urlBase,
        apiKey: input.apiKey === MASKED_SECRET_VALUE ? existing.apiKey : input.apiKey ?? existing.apiKey
      });
    } catch {
      version = await testQbittorrentConnection();
    }
    addLog("info", "qbittorrent_connection_test", "qBittorrent connection test succeeded", { version });
    return ok({ version });
  } catch (error) {
    addLog("error", "qbittorrent_connection_test_failed", "qBittorrent connection test failed", {
      error: error instanceof Error ? error.message : String(error)
    });
    return handleApiError(error);
  }
}
