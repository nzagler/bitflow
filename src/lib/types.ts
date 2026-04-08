export type QbittorrentMode = "throttled" | "normal" | "unknown";

export type QbittorrentSettings = {
  hostUrl: string;
  username: string;
  password: string;
  throttledUploadLimit: number;
  throttledDownloadLimit: number;
  normalUploadLimit: number;
  normalDownloadLimit: number;
};

export type WebhookSettings = {
  enabled: boolean;
  token: string;
  secret: string;
  activityWindowSeconds: number;
  publicBaseUrls: string[];
};

export type AutomationSettings = {
  inactivityTimeoutMinutes: number;
  pingIntervalSeconds: number;
  evaluationIntervalSeconds: number;
};

export type DeviceMonitoringSettings = {
  enabled: boolean;
};

export type DeviceRecord = {
  id: number;
  name: string;
  host: string;
  enabled: boolean;
  lastSeenAt: string | null;
  lastPingAt: string | null;
  lastReachable: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AppState = {
  id: number;
  qbittorrentMode: QbittorrentMode;
  lastWebhookAt: string | null;
  lastDeviceActivityAt: string | null;
  lastThrottleActionAt: string | null;
  lastThrottleAction: string | null;
  lastQbittorrentConnectionAt: string | null;
  lastQbittorrentError: string | null;
  lastEvaluatedAt: string | null;
};

export type LogRecord = {
  id: number;
  level: "info" | "warn" | "error";
  eventType: string;
  message: string;
  metadata: string | null;
  createdAt: string;
};

export type DashboardSnapshot = {
  state: AppState;
  qbittorrent: Omit<QbittorrentSettings, "password"> & { passwordConfigured: boolean };
  webhook: Omit<WebhookSettings, "secret"> & { secretConfigured: boolean };
  automation: AutomationSettings;
  monitoring: DeviceMonitoringSettings;
  devices: DeviceRecord[];
  recentLogs: LogRecord[];
  derived: {
    streamingActive: boolean;
    devicesActive: boolean;
    effectiveActive: boolean;
    webhookUrlPath: string;
    webhookUrls: string[];
  };
};
