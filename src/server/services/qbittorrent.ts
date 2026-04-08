import type { QbittorrentMode, QbittorrentSettings } from "@/lib/types";
import { getQbittorrentSettings, updateState } from "@/server/db";

type Limits = {
  upload: number;
  download: number;
};

function buildBaseUrl(hostUrl: string) {
  return hostUrl.replace(/\/+$/, "");
}

async function login(hostUrl: string, username: string, password: string) {
  const response = await fetch(`${buildBaseUrl(hostUrl)}/api/v2/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      username,
      password
    })
  });

  if (!response.ok) {
    throw new Error(`qBittorrent login failed with status ${response.status}`);
  }

  const text = await response.text();
  if (!text.includes("Ok")) {
    throw new Error("qBittorrent rejected the provided credentials");
  }

  const setCookie = response.headers.get("set-cookie");
  const cookieHeader = setCookie?.split(";")[0] ?? "";
  if (!cookieHeader) {
    throw new Error("qBittorrent did not return a session cookie");
  }

  return cookieHeader;
}

async function sendForm(hostUrl: string, cookie: string, path: string, body: Record<string, string>) {
  const response = await fetch(`${buildBaseUrl(hostUrl)}${path}`, {
    method: "POST",
    headers: {
      Cookie: cookie,
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

export async function testQbittorrentConnectionWithSettings(settings: Pick<QbittorrentSettings, "hostUrl" | "username" | "password">) {
  if (!settings.hostUrl || !settings.username || !settings.password) {
    throw new Error("qBittorrent host URL, username, and password are required");
  }

  const cookie = await login(settings.hostUrl, settings.username, settings.password);
  const response = await fetch(`${buildBaseUrl(settings.hostUrl)}/api/v2/app/version`, {
    headers: {
      Cookie: cookie
    }
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
  if (!settings.hostUrl || !settings.username || !settings.password) {
    throw new Error("qBittorrent is not configured");
  }

  const cookie = await login(settings.hostUrl, settings.username, settings.password);
  const limits = getLimitsForMode(mode);

  await sendForm(settings.hostUrl, cookie, "/api/v2/transfer/setUploadLimit", {
    limit: String(limits.upload)
  });
  await sendForm(settings.hostUrl, cookie, "/api/v2/transfer/setDownloadLimit", {
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
