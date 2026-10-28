import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("first-deployment environment seeds Backrest once and never replaces saved settings", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bitflow-bootstrap-"));
  Object.assign(process.env, { DATABASE_PATH: path.join(directory, "bitflow.db"),
    APP_ENCRYPTION_KEY: "isolated-bootstrap-test", BACKREST_ENABLED: "true",
    BACKREST_URL: "http://backrest:9898", BACKREST_PLAN_ID: "appdata" });
  const loadDatabaseModule = () => {
    const modulePath = require.resolve("../src/server/db");
    delete require.cache[modulePath];
    return require(modulePath) as typeof import("../src/server/db");
  };
  try {
    const first = loadDatabaseModule();
    first.initializeDatabase();
    const initial = first.getBackrestSettings();
    assert.equal(initial.enabled, true);
    assert.equal(initial.baseUrl, "http://backrest:9898");
    assert.equal(initial.planId, "appdata");
    first.saveBackrestSettings({ ...initial, enabled: false, baseUrl: "http://saved-setting:9898", planId: "saved-plan" });
    process.env.BACKREST_URL = "http://new-default:9898";
    process.env.BACKREST_PLAN_ID = "new-default";
    const restarted = loadDatabaseModule();
    restarted.initializeDatabase();
    const persisted = restarted.getBackrestSettings();
    assert.equal(persisted.enabled, false);
    assert.equal(persisted.baseUrl, "http://saved-setting:9898");
    assert.equal(persisted.planId, "saved-plan");
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
