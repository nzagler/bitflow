import type { AppState, AutomationSettings, BackrestSettings, DeviceMonitoringSettings, WebhookSettings } from "@/lib/types";

export const BACKREST_ACTIVITY_TTL_MS = 5 * 60 * 1000;

type ActivityInputs = {
  state: AppState;
  webhook: WebhookSettings;
  monitoring: DeviceMonitoringSettings;
  automation: AutomationSettings;
  backrest: BackrestSettings;
};

// The dashboard and controller share this decision. No source overrides another.
export function computeActivity({ state, webhook, monitoring, automation, backrest }: ActivityInputs, now = Date.now()) {
  const recent = (value: string | null, windowMs: number) => {
    const age = value ? now - Date.parse(value) : Number.POSITIVE_INFINITY;
    return age >= 0 && age <= windowMs;
  };
  const streamingActive = webhook.enabled && recent(state.lastWebhookAt, webhook.activityWindowSeconds * 1000);
  const devicesActive = monitoring.enabled && recent(state.lastDeviceActivityAt, Math.max(automation.pingIntervalSeconds * 2000, 15_000));
  const backrestActive = backrest.enabled && state.backrestActive && recent(state.lastBackrestPollAt, BACKREST_ACTIVITY_TTL_MS);
  const latestActivityAt = [state.lastWebhookAt, state.lastDeviceActivityAt, state.lastManualThrottleAt, backrest.enabled ? state.lastBackrestActivityAt : null]
    .filter((value): value is string => Boolean(value))
    .map(Date.parse)
    .filter((value) => Number.isFinite(value) && value <= now)
    .sort((left, right) => right - left)[0];
  const cooldownMs = automation.inactivityTimeoutMinutes * 60 * 1000;
  const cooldownActive = latestActivityAt !== undefined && now - latestActivityAt <= cooldownMs;
  const cooldownRemainingSeconds = latestActivityAt !== undefined
    ? Math.max(0, Math.ceil((cooldownMs - (now - latestActivityAt)) / 1000)) : 0;
  return {
    streamingActive, devicesActive, backrestActive, cooldownActive, cooldownRemainingSeconds,
    effectiveActive: !state.automationPaused && (streamingActive || devicesActive || backrestActive || cooldownActive)
  };
}
