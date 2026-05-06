import { ok, handleApiError } from "@/server/api";
import { addLog, updateState } from "@/server/db";
import { applyQbittorrentMode } from "@/server/services/qbittorrent";

export async function POST() {
  try {
    await applyQbittorrentMode("throttled");
    const now = new Date().toISOString();
    updateState({
      lastManualThrottleAt: now
    });
    addLog("info", "manual_throttle", "Manual throttle action applied", { cooldownStartedAt: now });
    return ok({ mode: "throttled" });
  } catch (error) {
    return handleApiError(error);
  }
}
