import ping from "ping";
import { addLog, getAutomationSettings, getDevices, getMonitoringSettings, getQbittorrentSettings, getState, getWebhookSettings, markDevicePing, updateState } from "@/server/db";
import { applyQbittorrentMode } from "@/server/services/qbittorrent";

let started = false;
let pingTimer: NodeJS.Timeout | null = null;
let evaluationTimer: NodeJS.Timeout | null = null;
let pingInFlight = false;
let evaluationInFlight = false;

async function runPingCycle() {
  if (pingInFlight) {
    return;
  }

  pingInFlight = true;
  try {
    const monitoring = getMonitoringSettings();
    if (!monitoring.enabled) {
      return;
    }

    const devices = getDevices().filter((device) => device.enabled);
    for (const device of devices) {
      try {
        const result = await ping.promise.probe(device.host, {
          timeout: 3,
          min_reply: 1
        });
        markDevicePing(device.id, result.alive);
        if (result.alive && !device.lastReachable) {
          addLog("info", "device_online", `Device "${device.name}" is reachable`, { deviceId: device.id, host: device.host });
        } else if (!result.alive && device.lastReachable) {
          addLog("info", "device_offline", `Device "${device.name}" is offline`, { deviceId: device.id, host: device.host });
        }
      } catch (error) {
        addLog("warn", "device_ping_failed", `Failed to ping "${device.name}"`, {
          deviceId: device.id,
          host: device.host,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  } finally {
    pingInFlight = false;
  }
}

export function computeEffectiveActivity(now = Date.now()) {
  const state = getState();
  const webhook = getWebhookSettings();
  const monitoring = getMonitoringSettings();
  const automation = getAutomationSettings();
  const cooldownMs = automation.inactivityTimeoutMinutes * 60 * 1000;

  const streamingActive = Boolean(
    webhook.enabled &&
    state.lastWebhookAt &&
    now - new Date(state.lastWebhookAt).getTime() <= webhook.activityWindowSeconds * 1000
  );

  const deviceRecentlySeen = Boolean(
    monitoring.enabled &&
    state.lastDeviceActivityAt &&
    now - new Date(state.lastDeviceActivityAt).getTime() <= Math.max(automation.pingIntervalSeconds * 2 * 1000, 15_000)
  );

  const latestActivityAt = [state.lastWebhookAt, state.lastDeviceActivityAt]
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((value) => !Number.isNaN(value))
    .sort((left, right) => right - left)[0];

  const cooldownActive = Boolean(
    latestActivityAt &&
    now - latestActivityAt <= cooldownMs
  );

  const devicesActive = Boolean(
    monitoring.enabled && deviceRecentlySeen
  );

  return {
    streamingActive,
    devicesActive,
    cooldownActive,
    effectiveActive: streamingActive || devicesActive || cooldownActive
  };
}

export async function evaluateAutomation(reason = "scheduler") {
  if (evaluationInFlight) {
    return;
  }

  evaluationInFlight = true;
  try {
    const currentState = getState();
    const activity = computeEffectiveActivity();
    const desiredMode = activity.effectiveActive ? "throttled" : "normal";
    const qbittorrent = getQbittorrentSettings();

    updateState({
      lastEvaluatedAt: new Date().toISOString()
    });

    if (!qbittorrent.hostUrl || !qbittorrent.username || !qbittorrent.password) {
      if (currentState.lastQbittorrentError !== "qBittorrent is not configured") {
        updateState({
          lastQbittorrentError: "qBittorrent is not configured"
        });
        addLog("warn", "qbittorrent_not_configured", "Automation evaluation skipped because qBittorrent is not configured");
      }
      return;
    }

    if (currentState.qbittorrentMode === desiredMode) {
      return;
    }

    try {
      const limits = await applyQbittorrentMode(desiredMode);
      addLog(
        "info",
        desiredMode === "throttled" ? "throttle_applied" : "throttle_restored",
        `${desiredMode === "throttled" ? "Throttled" : "Restored"} qBittorrent because ${reason}`,
        { ...activity, limits, reason }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateState({
        lastQbittorrentError: message
      });
      addLog("error", "qbittorrent_apply_failed", "Failed to apply qBittorrent mode", {
        reason,
        desiredMode,
        error: message
      });
    }
  } finally {
    evaluationInFlight = false;
  }
}

export async function registerWebhookActivity(source = "jellyfin") {
  const webhook = getWebhookSettings();
  const previousState = getState();
  const now = new Date().toISOString();
  const previousActivityAge = previousState.lastWebhookAt
    ? Date.now() - new Date(previousState.lastWebhookAt).getTime()
    : Number.POSITIVE_INFINITY;
  const wasStreamingActive = previousActivityAge <= webhook.activityWindowSeconds * 1000;

  updateState({
    lastWebhookAt: now
  });

  if (!wasStreamingActive) {
    addLog("info", "webhook_activity_started", "Received webhook activity and marked streaming as active", { source });
  }

  if (previousState.qbittorrentMode !== "throttled") {
    await evaluateAutomation("webhook activity");
  }
}

export async function startAutomation() {
  if (started) {
    return;
  }

  started = true;
  const automation = getAutomationSettings();

  pingTimer = setInterval(() => {
    void runPingCycle().then(() => evaluateAutomation("device monitoring"));
  }, automation.pingIntervalSeconds * 1000);

  evaluationTimer = setInterval(() => {
    void evaluateAutomation("periodic evaluation");
  }, automation.evaluationIntervalSeconds * 1000);

  await runPingCycle();
  await evaluateAutomation("startup");
}

export function restartAutomationTimers() {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
  if (evaluationTimer) {
    clearInterval(evaluationTimer);
    evaluationTimer = null;
  }
  started = false;
  return startAutomation();
}

export async function pingDeviceOnce(host: string) {
  const result = await ping.promise.probe(host, { timeout: 3, min_reply: 1 });
  return result.alive;
}
