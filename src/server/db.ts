import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { DATABASE_PATH, DEFAULT_WEBHOOK_TOKEN, LOG_LIMIT } from "@/lib/constants";
import type {
  AppState,
  BackrestSettings,
  AutomationSettings,
  DashboardSnapshot,
  DeviceMonitoringSettings,
  DeviceRecord,
  LogRecord,
  QbittorrentSettings,
  WebhookSettings
} from "@/lib/types";
import { decryptSecret, encryptSecret } from "@/server/security";

import { computeActivity } from "@/server/services/activity";

let database: Database.Database | null = null;

const DEFAULT_QBITTORRENT: QbittorrentSettings = {
  hostUrl: "",
  urlBase: "",
  apiKey: "",
  throttledUploadLimit: 1024,
  throttledDownloadLimit: 1024,
  normalUploadLimit: 3_000_000,
  normalDownloadLimit: 15_000_000
};

const DEFAULT_WEBHOOK: WebhookSettings = {
  enabled: true,
  token: DEFAULT_WEBHOOK_TOKEN,
  secret: "",
  activityWindowSeconds: 10
};

const DEFAULT_BACKREST: BackrestSettings = {
  enabled: process.env.BACKREST_ENABLED === "true",
  baseUrl: process.env.BACKREST_URL ?? "",
  planId: process.env.BACKREST_PLAN_ID ?? "appdata",
  username: "", password: ""
};

const DEFAULT_AUTOMATION: AutomationSettings = {
  inactivityTimeoutMinutes: 15,
  pingIntervalSeconds: 60,
  evaluationIntervalSeconds: 5
};

const DEFAULT_MONITORING: DeviceMonitoringSettings = {
  enabled: true
};

const DEFAULT_STATE: AppState = {
  id: 1,
  automationPaused: false,
  qbittorrentMode: "unknown",
  lastWebhookAt: null,
  lastDeviceActivityAt: null,
  lastManualThrottleAt: null,
  lastThrottleActionAt: null,
  lastThrottleAction: null,
  lastQbittorrentConnectionAt: null,
  lastQbittorrentError: null,
  lastEvaluatedAt: null,
  backrestActive: false, lastBackrestPollAt: null, lastBackrestActivityAt: null, lastBackrestError: null
};

function getDb() {
  if (!database) {
    initializeDatabase();
  }

  if (!database) {
    throw new Error("Database initialization failed");
  }

  return database;
}

export function initializeDatabase() {
  if (database) {
    return database;
  }

  fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });
  database = new Database(DATABASE_PATH);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");

  database.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_seen_at TEXT,
      last_ping_at TEXT,
      last_reachable INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      automation_paused INTEGER NOT NULL DEFAULT 0,
      qbittorrent_mode TEXT NOT NULL,
      last_webhook_at TEXT,
      last_device_activity_at TEXT,
      last_manual_throttle_at TEXT,
      last_throttle_action_at TEXT,
      last_throttle_action TEXT,
      last_qbittorrent_connection_at TEXT,
      last_qbittorrent_error TEXT,
      last_evaluated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL,
      event_type TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL
    );
  `);

  ensureColumn("app_state", "last_manual_throttle_at", "TEXT");
  ensureColumn("app_state", "automation_paused", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("app_state", "backrest_active", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("app_state", "last_backrest_poll_at", "TEXT");
  ensureColumn("app_state", "last_backrest_activity_at", "TEXT");
  ensureColumn("app_state", "last_backrest_error", "TEXT");

  // Older versions stored raw Jellyfin webhook payloads in log metadata.
  // Clear that metadata on startup so playback/user details are not retained.
  database.prepare(`
    UPDATE logs
    SET metadata = NULL
    WHERE event_type = 'webhook_received'
  `).run();

  ensureSetting("qbittorrent", serializeQbittorrent(DEFAULT_QBITTORRENT));
  ensureSetting("webhook", serializeWebhook(DEFAULT_WEBHOOK));
  ensureSetting("automation", JSON.stringify(DEFAULT_AUTOMATION));
  ensureSetting("monitoring", JSON.stringify(DEFAULT_MONITORING));
  ensureSetting("backrest", JSON.stringify(DEFAULT_BACKREST));

  const existingState = database.prepare("SELECT id FROM app_state WHERE id = 1").get();
  if (!existingState) {
    database.prepare(`
      INSERT INTO app_state (
        id,
        automation_paused,
        qbittorrent_mode,
        last_webhook_at,
        last_device_activity_at,
        last_manual_throttle_at,
        last_throttle_action_at,
        last_throttle_action,
        last_qbittorrent_connection_at,
        last_qbittorrent_error,
        last_evaluated_at
      ) VALUES (
        @id,
        @automationPaused,
        @qbittorrentMode,
        @lastWebhookAt,
        @lastDeviceActivityAt,
        @lastManualThrottleAt,
        @lastThrottleActionAt,
        @lastThrottleAction,
        @lastQbittorrentConnectionAt,
        @lastQbittorrentError,
        @lastEvaluatedAt
      )
    `).run({ ...DEFAULT_STATE, automationPaused: 0 });
  }

  return database;
}

function ensureSetting(key: string, value: string) {
  getDb().prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}

function ensureColumn(table: string, column: string, definition: string) {
  const rows = getDb().prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!rows.some((row) => row.name === column)) {
    getDb().prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
}

function getSetting<T>(key: string, parser: (raw: string) => T, fallback: T) {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value?: string } | undefined;
  if (!row?.value) {
    return fallback;
  }

  try {
    return parser(row.value);
  } catch {
    return fallback;
  }
}

function setSetting(key: string, value: string) {
  getDb().prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

function serializeQbittorrent(value: QbittorrentSettings) {
  return JSON.stringify({
    ...value,
    apiKey: value.apiKey ? encryptSecret(value.apiKey) : ""
  });
}

function parseQbittorrent(raw: string): QbittorrentSettings {
  const data = JSON.parse(raw) as Partial<Omit<QbittorrentSettings, "apiKey"> & { apiKey: string; password: string }>;
  return {
    ...DEFAULT_QBITTORRENT,
    ...data,
    apiKey: data.apiKey ? decryptSecret(data.apiKey) : ""
  };
}

function serializeWebhook(value: WebhookSettings) {
  return JSON.stringify({
    ...value,
    secret: value.secret ? encryptSecret(value.secret) : ""
  });
}

function parseWebhook(raw: string): WebhookSettings {
  const data = JSON.parse(raw) as Omit<WebhookSettings, "secret"> & { secret: string };
  return {
    ...DEFAULT_WEBHOOK,
    ...data,
    secret: data.secret ? decryptSecret(data.secret) : ""
  };
}

export function getQbittorrentSettings() {
  return getSetting("qbittorrent", parseQbittorrent, DEFAULT_QBITTORRENT);
}

export function saveQbittorrentSettings(value: QbittorrentSettings) {
  setSetting("qbittorrent", serializeQbittorrent(value));
}

export function getWebhookSettings() {
  return getSetting("webhook", parseWebhook, DEFAULT_WEBHOOK);
}

export function saveWebhookSettings(value: WebhookSettings) {
  setSetting("webhook", serializeWebhook(value));
}

export function getAutomationSettings() {
  return getSetting("automation", (raw) => ({ ...DEFAULT_AUTOMATION, ...JSON.parse(raw) }), DEFAULT_AUTOMATION);
}

export function saveAutomationSettings(value: AutomationSettings) {
  setSetting("automation", JSON.stringify(value));
}

export function getMonitoringSettings() {
  return getSetting("monitoring", (raw) => ({ ...DEFAULT_MONITORING, ...JSON.parse(raw) }), DEFAULT_MONITORING);
}

export function saveMonitoringSettings(value: DeviceMonitoringSettings) {
  setSetting("monitoring", JSON.stringify(value));
}

export function getBackrestSettings(): BackrestSettings {
  return getSetting("backrest", (raw) => {
    const data = { ...DEFAULT_BACKREST, ...JSON.parse(raw) };
    return { ...data, password: data.password ? decryptSecret(data.password) : "" };
  }, DEFAULT_BACKREST);
}

export function saveBackrestSettings(value: BackrestSettings) {
  setSetting("backrest", JSON.stringify({ ...value, password: value.password ? encryptSecret(value.password) : "" }));
  updateState({ backrestActive: false, lastBackrestPollAt: null, lastBackrestActivityAt: null, lastBackrestError: null });
}

export function getDevices(): DeviceRecord[] {
  return getDb().prepare(`
    SELECT
      id,
      name,
      host,
      enabled,
      last_seen_at as lastSeenAt,
      last_ping_at as lastPingAt,
      last_reachable as lastReachable,
      created_at as createdAt,
      updated_at as updatedAt
    FROM devices
    ORDER BY name COLLATE NOCASE ASC
  `).all().map((device: any) => ({
    ...device,
    enabled: Boolean(device.enabled),
    lastReachable: Boolean(device.lastReachable)
  }));
}

export function createDevice(input: Pick<DeviceRecord, "name" | "host" | "enabled">) {
  const now = new Date().toISOString();
  const result = getDb().prepare(`
    INSERT INTO devices (name, host, enabled, created_at, updated_at)
    VALUES (@name, @host, @enabled, @createdAt, @updatedAt)
  `).run({
    name: input.name,
    host: input.host,
    enabled: input.enabled ? 1 : 0,
    createdAt: now,
    updatedAt: now
  });

  return getDeviceById(Number(result.lastInsertRowid));
}

export function updateDevice(id: number, input: Pick<DeviceRecord, "name" | "host" | "enabled">) {
  const now = new Date().toISOString();
  getDb().prepare(`
    UPDATE devices
    SET name = @name, host = @host, enabled = @enabled, updated_at = @updatedAt
    WHERE id = @id
  `).run({
    id,
    name: input.name,
    host: input.host,
    enabled: input.enabled ? 1 : 0,
    updatedAt: now
  });

  return getDeviceById(id);
}

export function deleteDevice(id: number) {
  getDb().prepare("DELETE FROM devices WHERE id = ?").run(id);
}

export function getDeviceById(id: number) {
  const row = getDb().prepare(`
    SELECT
      id,
      name,
      host,
      enabled,
      last_seen_at as lastSeenAt,
      last_ping_at as lastPingAt,
      last_reachable as lastReachable,
      created_at as createdAt,
      updated_at as updatedAt
    FROM devices
    WHERE id = ?
  `).get(id) as any;

  if (!row) {
    return null;
  }

  return {
    ...row,
    enabled: Boolean(row.enabled),
    lastReachable: Boolean(row.lastReachable)
  } satisfies DeviceRecord;
}

export function markDevicePing(id: number, reachable: boolean) {
  const now = new Date().toISOString();
  getDb().prepare(`
    UPDATE devices
    SET
      last_ping_at = @now,
      last_seen_at = CASE WHEN @reachable = 1 THEN @now ELSE last_seen_at END,
      last_reachable = @reachable,
      updated_at = @now
    WHERE id = @id
  `).run({
    id,
    now,
    reachable: reachable ? 1 : 0
  });

  if (reachable) {
    updateState({
      lastDeviceActivityAt: now
    });
  }
}

export function getState(): AppState {
  const row = getDb().prepare(`
    SELECT
      id,
      automation_paused as automationPaused,
      qbittorrent_mode as qbittorrentMode,
      last_webhook_at as lastWebhookAt,
      last_device_activity_at as lastDeviceActivityAt,
      last_manual_throttle_at as lastManualThrottleAt,
      last_throttle_action_at as lastThrottleActionAt,
      last_throttle_action as lastThrottleAction,
      last_qbittorrent_connection_at as lastQbittorrentConnectionAt,
      last_qbittorrent_error as lastQbittorrentError,
      last_evaluated_at as lastEvaluatedAt,
      backrest_active as backrestActive,
      last_backrest_poll_at as lastBackrestPollAt,
      last_backrest_activity_at as lastBackrestActivityAt,
      last_backrest_error as lastBackrestError
    FROM app_state
    WHERE id = 1
  `).get() as AppState | undefined;

  return row ? { ...row, automationPaused: Boolean(row.automationPaused), backrestActive: Boolean(row.backrestActive) } : DEFAULT_STATE;
}

export function updateState(partial: Partial<AppState>) {
  const current = getState();
  const next: AppState = {
    ...current,
    ...partial,
    id: 1
  };

  getDb().prepare(`
    UPDATE app_state SET
      automation_paused = @automationPaused,
      qbittorrent_mode = @qbittorrentMode,
      last_webhook_at = @lastWebhookAt,
      last_device_activity_at = @lastDeviceActivityAt,
      last_manual_throttle_at = @lastManualThrottleAt,
      last_throttle_action_at = @lastThrottleActionAt,
      last_throttle_action = @lastThrottleAction,
      last_qbittorrent_connection_at = @lastQbittorrentConnectionAt,
      last_qbittorrent_error = @lastQbittorrentError,
      last_evaluated_at = @lastEvaluatedAt,
      backrest_active = @backrestActive,
      last_backrest_poll_at = @lastBackrestPollAt,
      last_backrest_activity_at = @lastBackrestActivityAt,
      last_backrest_error = @lastBackrestError
    WHERE id = 1
  `).run({ ...next, automationPaused: next.automationPaused ? 1 : 0, backrestActive: next.backrestActive ? 1 : 0 });

  return next;
}

export function addLog(level: LogRecord["level"], eventType: string, message: string, metadata?: unknown) {
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO logs (level, event_type, message, metadata, created_at)
    VALUES (@level, @eventType, @message, @metadata, @createdAt)
  `).run({
    level,
    eventType,
    message,
    metadata: metadata ? JSON.stringify(metadata) : null,
    createdAt: now
  });

  const count = getDb().prepare("SELECT COUNT(*) as total FROM logs").get() as { total: number };
  if (count.total > 5000) {
    getDb().prepare(`
      DELETE FROM logs
      WHERE id NOT IN (
        SELECT id FROM logs ORDER BY id DESC LIMIT 5000
      )
    `).run();
  }
}

export function getLogs(limit = LOG_LIMIT): LogRecord[] {
  return getDb().prepare(`
    SELECT
      id,
      level,
      event_type as eventType,
      message,
      metadata,
      created_at as createdAt
    FROM logs
    ORDER BY id DESC
    LIMIT ?
  `).all(limit) as LogRecord[];
}

export function buildDashboardSnapshot(): DashboardSnapshot {
  const qbittorrent = getQbittorrentSettings();
  const webhook = getWebhookSettings();
  const automation = getAutomationSettings();
  const monitoring = getMonitoringSettings();
  const state = getState();
  const devices = getDevices();
  const backrest = getBackrestSettings();
  const activity = computeActivity({ state, webhook, monitoring, automation, backrest });

  return {
    state,
    qbittorrent: {
      hostUrl: qbittorrent.hostUrl,
      urlBase: qbittorrent.urlBase,
      throttledUploadLimit: qbittorrent.throttledUploadLimit,
      throttledDownloadLimit: qbittorrent.throttledDownloadLimit,
      normalUploadLimit: qbittorrent.normalUploadLimit,
      normalDownloadLimit: qbittorrent.normalDownloadLimit,
      apiKeyConfigured: Boolean(qbittorrent.apiKey)
    },
    webhook: {
      enabled: webhook.enabled,
      token: webhook.token,
      activityWindowSeconds: webhook.activityWindowSeconds,
      secretConfigured: Boolean(webhook.secret)
    },
    automation,
    monitoring,
    backrest: { enabled: backrest.enabled, baseUrl: backrest.baseUrl, planId: backrest.planId, username: backrest.username, passwordConfigured: Boolean(backrest.password) },
    devices,
    recentLogs: getLogs(),
    derived: {
      automationPaused: state.automationPaused,
      ...activity,
      webhookUrlPath: `/api/webhook/${webhook.token}`
    }
  };
}
