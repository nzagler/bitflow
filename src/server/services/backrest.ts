import type { BackrestSettings } from "@/lib/types";
import { addLog, getBackrestSettings, getState, updateState } from "@/server/db";

type Operation = { status?: string | number; operationBackup?: unknown };

export function hasRunningBackup(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Backrest operation response");
  const operations = (value as { operations?: unknown }).operations ?? [];
  if (!Array.isArray(operations)) throw new Error("Invalid Backrest operation list");
  return operations.some((operation: Operation) => operation && operation.operationBackup != null &&
    (operation.status === "STATUS_INPROGRESS" || operation.status === 2));
}

export async function queryBackrest(settings: BackrestSettings) {
  const response = await fetch(`${settings.baseUrl.replace(/\/+$/, "")}/v1.Backrest/GetOperations`, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(5000),
    headers: {
      "Content-Type": "application/json",
      ...(settings.username || settings.password ? { Authorization: `Basic ${Buffer.from(`${settings.username}:${settings.password}`).toString("base64")}` } : {})
    },
    body: JSON.stringify({ selector: { planId: settings.planId } })
  });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Backrest request failed (${response.status})`); }
  return hasRunningBackup(await response.json());
}

export async function pollBackrestActivity() {
  const settings = getBackrestSettings();
  if (!settings.enabled) return;
  try {
    const active = await queryBackrest(settings);
    // A settings change can occur while a request is in flight. Discard its old signal.
    if (JSON.stringify(settings) !== JSON.stringify(getBackrestSettings())) return;
    const previous = getState();
    const now = new Date().toISOString();
    updateState({ backrestActive: active, lastBackrestPollAt: now,
      ...(active ? { lastBackrestActivityAt: now } : {}), lastBackrestError: null });
    if (previous.lastBackrestError) addLog("info", "backrest_recovered", "Backrest connection recovered");
    if (previous.backrestActive !== active) addLog("info", active ? "backrest_started" : "backrest_finished",
      active ? "Backrest backup is active" : "Backrest backup ended; other activity and cooldown still apply");
  } catch (error) {
    if (JSON.stringify(settings) !== JSON.stringify(getBackrestSettings())) return;
    const message = error instanceof Error ? error.message : String(error);
    if (getState().lastBackrestError !== message) addLog("warn", "backrest_unavailable", "Unable to check Backrest; other activity signals remain enabled", { error: message });
    // Do not refresh the successful observation timestamp: stale activity expires.
    updateState({ lastBackrestError: message });
  }
}
