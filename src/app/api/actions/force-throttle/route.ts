import { ok, handleApiError } from "@/server/api";
import { addLog } from "@/server/db";
import { applyQbittorrentMode } from "@/server/services/qbittorrent";

export async function POST() {
  try {
    await applyQbittorrentMode("throttled");
    addLog("info", "manual_throttle", "Manual throttle action applied");
    return ok({ mode: "throttled" });
  } catch (error) {
    return handleApiError(error);
  }
}
