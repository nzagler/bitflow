import { ok, handleApiError } from "@/server/api";
import { addLog, updateState } from "@/server/db";
import { applyQbittorrentMode } from "@/server/services/qbittorrent";

export async function POST() {
  try {
    await applyQbittorrentMode("normal");
    updateState({
      lastManualThrottleAt: null
    });
    addLog("info", "manual_unthrottle", "Manual unthrottle action applied");
    return ok({ mode: "normal" });
  } catch (error) {
    return handleApiError(error);
  }
}
