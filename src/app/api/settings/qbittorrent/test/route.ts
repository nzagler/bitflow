import { ok, handleApiError } from "@/server/api";
import { addLog } from "@/server/db";
import { testQbittorrentConnection } from "@/server/services/qbittorrent";

export async function POST() {
  try {
    const version = await testQbittorrentConnection();
    addLog("info", "qbittorrent_connection_test", "qBittorrent connection test succeeded", { version });
    return ok({ version });
  } catch (error) {
    addLog("error", "qbittorrent_connection_test_failed", "qBittorrent connection test failed", {
      error: error instanceof Error ? error.message : String(error)
    });
    return handleApiError(error);
  }
}
