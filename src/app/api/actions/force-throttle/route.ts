import { fail, ok, handleApiError } from "@/server/api";
import { addLog, getState, updateState } from "@/server/db";
import { applyQbittorrentMode } from "@/server/services/qbittorrent";

export async function POST() {
  try {
    if (getState().automationPaused) {
      return fail("Automation is paused. Resume Bitflow before forcing throttle.", 409);
    }
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
