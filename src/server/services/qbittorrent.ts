import type { QbittorrentMode, QbittorrentSettings } from "@/lib/types";
import { getQbittorrentSettings, updateState } from "@/server/db";

type Limits = {
  upload: number;
  download: number;
};

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
    headers: {
      ...buildAuthHeaders(settings.apiKey),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams(body)
  });

  if (!response.ok) {
    throw new Error(`qBittorrent request failed with status ${response.status}`);
  }
}

export async function testQbittorrentConnection() {
  return testQbittorrentConnectionWithSettings(getQbittorrentSettings());
}

export async function testQbittorrentConnectionWithSettings(settings: Pick<QbittorrentSettings, "hostUrl" | "urlBase" | "apiKey">) {
  if (!settings.hostUrl) {
    throw new Error("qBittorrent host URL is required");
  }

  const response = await fetch(`${buildBaseUrl(settings.hostUrl, settings.urlBase)}/api/v2/app/version`, {
    headers: buildAuthHeaders(settings.apiKey)
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

export async function applyQbittorrentMode(mode: Exclude<QbittorrentMode, "unknown">) {
  const settings = getQbittorrentSettings();
  if (!settings.hostUrl) {
    throw new Error("qBittorrent is not configured");
  }

  const limits = getLimitsForMode(mode);

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
