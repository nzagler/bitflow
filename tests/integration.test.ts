import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

test("controller integration", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bitflow-test-"));
  process.env.DATABASE_PATH = path.join(directory, "bitflow.db");
  process.env.APP_ENCRYPTION_KEY = "isolated-test-key";
  // Simulate the existing deployment before Backrest columns/settings exist.
  const legacy = new Database(process.env.DATABASE_PATH);
  legacy.exec(`CREATE TABLE app_state (
    id INTEGER PRIMARY KEY, automation_paused INTEGER NOT NULL DEFAULT 0, qbittorrent_mode TEXT NOT NULL,
    last_webhook_at TEXT, last_device_activity_at TEXT, last_manual_throttle_at TEXT,
    last_throttle_action_at TEXT, last_throttle_action TEXT, last_qbittorrent_connection_at TEXT,
    last_qbittorrent_error TEXT, last_evaluated_at TEXT
  ); INSERT INTO app_state (id, qbittorrent_mode) VALUES (1, 'throttled');
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  const { encryptSecret } = await import("../src/server/security");
  const originalSettings = {
    qbittorrent: { hostUrl: "http://qbittorrent:8080", urlBase: "", apiKey: encryptSecret("existing-qb-key"),
      throttledUploadLimit: 1, throttledDownloadLimit: 1, normalUploadLimit: 3_000_000, normalDownloadLimit: 25_000_000 },
    webhook: { enabled: true, token: "keep-this-route", secret: encryptSecret("existing-webhook-secret"), activityWindowSeconds: 10 },
    automation: { inactivityTimeoutMinutes: 17, pingIntervalSeconds: 60, evaluationIntervalSeconds: 5 },
    monitoring: { enabled: true }
  };
  const originalRows = Object.entries(originalSettings).map(([key, value]) => ({ key, value: JSON.stringify(value) }));
  for (const row of originalRows) legacy.prepare("INSERT INTO settings VALUES (@key, @value)").run(row);
  legacy.exec(`CREATE TABLE devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, host TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
    last_seen_at TEXT, last_ping_at TEXT, last_reachable INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  ); INSERT INTO devices (id, name, host, enabled, created_at, updated_at)
  VALUES (7, 'Existing TV', '192.0.2.40', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');`);
  const originalDevices = legacy.prepare("SELECT * FROM devices").all();
  legacy.close();
  const db = await import("../src/server/db");
  const { evaluateAutomation } = await import("../src/server/services/automation");
  const { hasRunningBackup, pollBackrestActivity } = await import("../src/server/services/backrest");
  const { limitMatches } = await import("../src/server/services/qbittorrent");
  const { backrestSchema } = await import("../src/server/validation");
  db.initializeDatabase();

  let running = true;
  let backrestFails = false;
  let actualUpload = 3_000_000;
  let actualDownload = 15_000_000;
  let alternativeMode = 0;
  const writes: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const target = String(url);
    if (target.includes("backrest")) {
      if (backrestFails) throw new Error("Backrest unreachable");
      const request = JSON.parse(String(options?.body));
      assert.equal(request.selector.planId, "appdata");
      return Response.json({ operations: running ? [{ status: "STATUS_INPROGRESS", operationBackup: {} }] : [] });
    }
    if (target.endsWith("/info")) return Response.json({ up_rate_limit: actualUpload, dl_rate_limit: actualDownload });
    if (target.endsWith("/speedLimitsMode")) return Response.json(alternativeMode);
    if (target.endsWith("/toggleSpeedLimitsMode")) { alternativeMode = 1 - alternativeMode; writes.push("toggle"); }
    else if (target.includes("/set")) {
      const limit = Number(new URLSearchParams(String(options?.body)).get("limit"));
      if (target.endsWith("setUploadLimit")) actualUpload = Math.max(1024, limit);
      else if (target.endsWith("setDownloadLimit")) actualDownload = Math.max(1024, limit);
      else throw new Error("Unexpected write " + target);
      writes.push(target);
    } else throw new Error("Unexpected request " + target);
    return new Response("");
  };

  await t.test("existing databases preserve every setting, encrypted secret and device during migration", () => {
    assert.equal(db.getQbittorrentSettings().throttledUploadLimit, 1);
    assert.equal(db.getQbittorrentSettings().normalDownloadLimit, 25_000_000);
    assert.equal(db.getState().qbittorrentMode, "throttled");
    assert.equal(db.getState().backrestActive, false);
    assert.equal(db.getBackrestSettings().enabled, false);
    assert.equal(db.getQbittorrentSettings().apiKey, "existing-qb-key");
    assert.equal(db.getWebhookSettings().token, "keep-this-route");
    assert.equal(db.getWebhookSettings().secret, "existing-webhook-secret");
    assert.deepEqual(db.getAutomationSettings(), originalSettings.automation);
    assert.deepEqual(db.getMonitoringSettings(), originalSettings.monitoring);
    const migrated = new Database(process.env.DATABASE_PATH!, { readonly: true });
    assert.deepEqual(migrated.prepare("SELECT key, value FROM settings WHERE key != 'backrest' ORDER BY key").all(),
      [...originalRows].sort((left, right) => left.key.localeCompare(right.key)));
    assert.deepEqual(migrated.prepare("SELECT * FROM devices").all(), originalDevices);
    migrated.close();
  });

  await t.test("Backrest drives the same profile; ending it preserves Jellyfin, then cooldown ends normally", async () => {
    db.saveBackrestSettings({ enabled: true, baseUrl: "http://backrest:9898", planId: "appdata", username: "", password: "" });
    db.saveQbittorrentSettings({ hostUrl: "http://qbittorrent:8080", urlBase: "", apiKey: "", throttledUploadLimit: 1024, throttledDownloadLimit: 1024, normalUploadLimit: 3_000_000, normalDownloadLimit: 15_000_000 });
    await evaluateAutomation("test backup");
    assert.equal(db.getState().qbittorrentMode, "throttled");
    assert.equal(actualUpload, 1024);
    assert.equal(actualDownload, 1024);
    assert.equal(db.buildDashboardSnapshot().derived.backrestActive, true);
    const applied = writes.length;
    await evaluateAutomation("unchanged backup");
    assert.equal(writes.length, applied, "unchanged verified limits do not cause writes");
    running = false;
    db.updateState({ lastWebhookAt: new Date().toISOString(), lastBackrestActivityAt: null });
    await evaluateAutomation("backup ended but Jellyfin active");
    const activity = db.buildDashboardSnapshot().derived;
    assert.equal(activity.backrestActive, false);
    assert.equal(activity.streamingActive, true);
    assert.equal(db.getState().qbittorrentMode, "throttled");
    assert.equal(writes.length, applied);
    db.updateState({ lastWebhookAt: null });
    await evaluateAutomation("all activity ended");
    assert.equal(db.getState().qbittorrentMode, "normal");
    assert.equal(actualUpload, 3_000_000);
  });

  await t.test("actual qBittorrent limits are repaired even when the remembered mode already matches", async () => {
    running = true;
    await evaluateAutomation("backup resumed");
    actualUpload = 0; actualDownload = 0; alternativeMode = 1;
    await evaluateAutomation("qBittorrent restarted");
    assert.equal(actualUpload, 1024);
    assert.equal(actualDownload, 1024);
    assert.equal(alternativeMode, 0);
    assert.ok(writes.includes("toggle"));
  });

  await t.test("Backrest outages do not prevent other activity from controlling the shared profile", async () => {
    backrestFails = true;
    db.updateState({ backrestActive: false, lastBackrestPollAt: null, lastBackrestActivityAt: null, lastDeviceActivityAt: new Date().toISOString(), qbittorrentMode: "normal" });
    actualUpload = 3_000_000; actualDownload = 15_000_000;
    await evaluateAutomation("network activity with unavailable Backrest");
    assert.equal(db.getState().qbittorrentMode, "throttled");
    assert.equal(db.getState().lastBackrestError, "Backrest unreachable");
    backrestFails = false;
  });

  await t.test("Backrest password is encrypted, absent from dashboard, and persisted independently of activity", async () => {
    const password = "example-test-password";
    db.saveBackrestSettings({ enabled: true, baseUrl: "http://backrest:9898", planId: "appdata", username: "test", password });
    await pollBackrestActivity();
    assert.equal(db.getBackrestSettings().password, password);
    assert.equal(db.getState().backrestActive, true);
    const raw = new Database(process.env.DATABASE_PATH!, { readonly: true });
    const stored = raw.prepare("SELECT value FROM settings WHERE key='backrest'").get() as { value: string };
    raw.close();
    assert.ok(!stored.value.includes(password));
    assert.ok(!JSON.stringify(db.buildDashboardSnapshot()).includes(password));
  });

  await t.test("only in-progress backup operations count, not queued, completed or maintenance tasks", () => {
    assert.equal(hasRunningBackup({ operations: [{ status: "STATUS_PENDING", operationBackup: {} }] }), false);
    for (const status of ["STATUS_SUCCESS", "STATUS_WARNING", "STATUS_ERROR", "STATUS_SYSTEM_CANCELLED", "STATUS_USER_CANCELLED"]) {
      assert.equal(hasRunningBackup({ operations: [{ status, operationBackup: {} }] }), false);
    }
    assert.equal(hasRunningBackup({ operations: [{ status: "STATUS_INPROGRESS", operationCheck: {} }] }), false);
    assert.equal(hasRunningBackup({ operations: [{ status: 2, operationBackup: {} }] }), true);
    assert.throws(() => hasRunningBackup({ operations: "invalid" }));
  });

  await t.test("Backrest URL validation and qBittorrent limit rounding", () => {
    const valid = { enabled: true, baseUrl: "http://backrest:9898", planId: "appdata", username: "", password: "" };
    assert.equal(backrestSchema.safeParse(valid).success, true);
    for (const baseUrl of ["", "file:///data/config", "http://user:secret@backrest:9898", "http://backrest:9898?token=secret"]) assert.equal(backrestSchema.safeParse({ ...valid, baseUrl }).success, false);
    assert.equal(limitMatches(1024, 1), true);
    assert.equal(limitMatches(0, 1024), false);
    assert.equal(limitMatches(3_000_000, 1024), false);
  });

  t.after(() => { globalThis.fetch = originalFetch; fs.rmSync(directory, { recursive: true, force: true }); });
});
