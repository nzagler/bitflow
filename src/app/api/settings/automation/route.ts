import { readJson, ok, handleApiError } from "@/server/api";
import { addLog, saveAutomationSettings, updateState } from "@/server/db";
import { evaluateAutomation, restartAutomationTimers } from "@/server/services/automation";
import { applyQbittorrentMode } from "@/server/services/qbittorrent";
import { automationSchema } from "@/server/validation";

export async function POST() {
  updateState({ automationPaused: true });

  try {
    const limits = await applyQbittorrentMode("normal");
    addLog("warn", "automation_paused", "Emergency pause enabled; normal bandwidth limits restored", { limits });
    return ok({ paused: true, mode: "normal" });
  } catch (error) {
    addLog("error", "automation_pause_failed", "Emergency pause enabled, but normal bandwidth limits could not be restored", {
      error: error instanceof Error ? error.message : String(error)
    });
    return handleApiError(error);
  }
}

export async function DELETE() {
  try {
    updateState({ automationPaused: false });
    addLog("info", "automation_resumed", "Automation resumed");
    await evaluateAutomation("automation resumed");
    return ok({ paused: false });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const input = automationSchema.parse(await readJson(request));
    saveAutomationSettings(input);
    await restartAutomationTimers();
    return ok({ saved: true });
  } catch (error) {
    return handleApiError(error);
  }
}
