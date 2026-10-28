import type { QbittorrentMode, QbittorrentSettings } from "@/lib/types";
import { getQbittorrentSettings, getState, updateState } from "@/server/db";

type Limits = {
  upload: number;
  download: number;
};

let modeApplicationQueue: Promise<void> = Promise.resolve();

function buildBaseUrl(hostUrl: string, urlBase = "") {
  const normalizedHost = hostUrl.replace(/\/+$/, "");
  const normalizedBase = urlBase ? `/${urlBase.replace(/^\/+|\/+$/g, "")}` : "";
  return `${normalizedHost}${normalizedBase}`;
}

function buildAuthHeaders(apiKey: string): Record<string, string> {
  if (!apiKey) {
    return {};
  }

  return {
    Authorization: `Bearer ${apiKey}`
  };
}

async function sendForm(settings: Pick<QbittorrentSettings, "hostUrl" | "urlBase" | "apiKey">, path: string, body: Record<string, string>) {
  const response = await fetch(`${buildBaseUrl(settings.hostUrl, settings.urlBase)}${path}`, {
    method: "POST",
    signal: AbortSignal.timeout(5000),
    headers: {
      ...buildAuthHeaders(settings.apiKey),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams(body)
  });

  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`qBittorrent request failed with status ${response.status}`);
  }
  await response.body?.cancel();
}

async function readQbittorrent(settings: QbittorrentSettings, path: string) {
  const response = await fetch(`${buildBaseUrl(settings.hostUrl, settings.urlBase)}${path}`, {
    headers: buildAuthHeaders(settings.apiKey), signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Unable to query qBittorrent (${response.status})`); }
  return response.json();
}

export async function testQbittorrentConnection() {
  return testQbittorrentConnectionWithSettings(getQbittorrentSettings());
}

export async function testQbittorrentConnectionWithSettings(settings: Pick<QbittorrentSettings, "hostUrl" | "urlBase" | "apiKey">) {
  if (!settings.hostUrl) {
    throw new Error("qBittorrent host URL is required");
  }

  const response = await fetch(`${buildBaseUrl(settings.hostUrl, settings.urlBase)}/api/v2/app/version`, {
    headers: buildAuthHeaders(settings.apiKey), signal: AbortSignal.timeout(5000)
  });

  if (!response.ok) {
    throw new Error(`Unable to query qBittorrent version (${response.status})`);
  }

  const version = await response.text();
  updateState({
    lastQbittorrentConnectionAt: new Date().toISOString(),
    lastQbittorrentError: null
  });

  return version.trim();
}

function getLimitsForMode(mode: QbittorrentMode) {
  const settings = getQbittorrentSettings();
  if (mode === "throttled") {
    return {
      upload: settings.throttledUploadLimit,
      download: settings.throttledDownloadLimit
    };
  }

  return {
    upload: settings.normalUploadLimit,
    download: settings.normalDownloadLimit
  };
}

async function applyQbittorrentModeNow(mode: Exclude<QbittorrentMode, "unknown">) {
  const settings = getQbittorrentSettings();
  if (!settings.hostUrl) {
    throw new Error("qBittorrent is not configured");
  }

  const limits = getLimitsForMode(mode);

  // Global profile limits must be the active limits, even if qBittorrent's
  // alternative-speed switch was changed outside Bitflow.
  const alternativeMode = await readQbittorrent(settings, "/api/v2/transfer/speedLimitsMode");
  if (alternativeMode === 1) await sendForm(settings, "/api/v2/transfer/toggleSpeedLimitsMode", {});

  await sendForm(settings, "/api/v2/transfer/setUploadLimit", {
    limit: String(limits.upload)
  });
  await sendForm(settings, "/api/v2/transfer/setDownloadLimit", {
    limit: String(limits.download)
  });

  updateState({
    qbittorrentMode: mode,
    lastThrottleActionAt: new Date().toISOString(),
    lastThrottleAction: mode === "throttled" ? "Applied throttled bandwidth limits" : "Restored normal bandwidth limits",
    lastQbittorrentConnectionAt: new Date().toISOString(),
    lastQbittorrentError: null
  });

  return limits;
}

export function applyQbittorrentMode(mode: Exclude<QbittorrentMode, "unknown">) {
  const application = modeApplicationQueue.then(() => applyQbittorrentModeNow(mode));
  modeApplicationQueue = application.then(() => undefined, () => undefined);
  return application;
}

// qBittorrent stores speed limits at KiB/s precision, with a 1 KiB/s minimum.
export function limitMatches(actual: unknown, expected: number) {
  return typeof actual === "number" && Number.isFinite(actual) && actual > 0 && Math.abs(actual - expected) < 1024;
}

export function ensureQbittorrentMode(mode: Exclude<QbittorrentMode, "unknown">): Promise<Limits | null> {
  const application = modeApplicationQueue.then(async () => {
    const settings = getQbittorrentSettings();
    const info = await readQbittorrent(settings, "/api/v2/transfer/info");
    const limits = getLimitsForMode(mode);
    const state = getState();
    if (state.qbittorrentMode === mode && limitMatches(info.up_rate_limit, limits.upload) && limitMatches(info.dl_rate_limit, limits.download)) {
      updateState({ lastQbittorrentConnectionAt: new Date().toISOString(), lastQbittorrentError: null });
      return null;
    }
    return applyQbittorrentModeNow(mode);
  });
  modeApplicationQueue = application.then(() => undefined, () => undefined);
  return application;
}
