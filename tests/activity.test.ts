import assert from "node:assert/strict";
import test from "node:test";
import type { AppState } from "../src/lib/types";
import { BACKREST_ACTIVITY_TTL_MS, computeActivity } from "../src/server/services/activity";

const now = Date.parse("2026-10-30T03:00:00Z");
const stamp = new Date(now).toISOString();
function inputs() {
  return {
    state: { id: 1, automationPaused: false, qbittorrentMode: "unknown", lastWebhookAt: null,
      lastDeviceActivityAt: null, lastManualThrottleAt: null, lastThrottleActionAt: null,
      lastThrottleAction: null, lastQbittorrentConnectionAt: null, lastQbittorrentError: null,
      lastEvaluatedAt: null, backrestActive: false, lastBackrestPollAt: null,
      lastBackrestActivityAt: null, lastBackrestError: null } as AppState,
    webhook: { enabled: true, token: "test", secret: "", activityWindowSeconds: 10 },
    monitoring: { enabled: true },
    automation: { inactivityTimeoutMinutes: 15, pingIntervalSeconds: 60, evaluationIntervalSeconds: 5 },
    backrest: { enabled: true, baseUrl: "http://backrest:9898", planId: "appdata", username: "", password: "" }
  };
}

for (let mask = 0; mask < 8; mask++) {
  test(`shared OR rule: Jellyfin=${Boolean(mask & 1)}, devices=${Boolean(mask & 2)}, Backrest=${Boolean(mask & 4)}`, () => {
    const input = inputs();
    input.state.lastWebhookAt = mask & 1 ? stamp : null;
    input.state.lastDeviceActivityAt = mask & 2 ? stamp : null;
    input.state.backrestActive = Boolean(mask & 4);
    input.state.lastBackrestPollAt = stamp;
    const actual = computeActivity(input, now);
    assert.equal(actual.streamingActive, Boolean(mask & 1));
    assert.equal(actual.devicesActive, Boolean(mask & 2));
    assert.equal(actual.backrestActive, Boolean(mask & 4));
    assert.equal(actual.effectiveActive, mask !== 0);
  });
}

test("a backup lasting longer than the inactivity timeout remains active", () => {
  const input = inputs();
  input.state.backrestActive = true;
  input.state.lastBackrestPollAt = stamp;
  assert.equal(computeActivity(input, now).effectiveActive, true);
  input.state.lastBackrestPollAt = new Date(now + 2 * 60 * 60 * 1000).toISOString();
  assert.equal(computeActivity(input, now + 2 * 60 * 60 * 1000).effectiveActive, true);
});

test("backup completion never suppresses Jellyfin or device activity", () => {
  const input = inputs();
  input.state.backrestActive = true;
  input.state.lastBackrestPollAt = stamp;
  input.state.lastWebhookAt = stamp;
  input.state.lastDeviceActivityAt = stamp;
  assert.equal(computeActivity(input, now).effectiveActive, true);
  input.state.backrestActive = false;
  const actual = computeActivity(input, now);
  assert.equal(actual.backrestActive, false);
  assert.equal(actual.streamingActive, true);
  assert.equal(actual.devicesActive, true);
  assert.equal(actual.effectiveActive, true);
});

test("backup completion retains the existing cooldown and then restores normal", () => {
  const input = inputs();
  input.state.lastBackrestActivityAt = stamp;
  assert.equal(computeActivity(input, now + 5 * 60 * 1000).effectiveActive, true);
  assert.equal(computeActivity(input, now + 16 * 60 * 1000).effectiveActive, false);
});

test("a lost Backrest connection cannot hold throttling forever or suppress other sources", () => {
  const input = inputs();
  input.state.backrestActive = true;
  input.state.lastBackrestPollAt = stamp;
  input.state.lastBackrestActivityAt = stamp;
  input.state.lastBackrestError = "connection refused";
  assert.equal(computeActivity(input, now + BACKREST_ACTIVITY_TTL_MS - 1).backrestActive, true);
  assert.equal(computeActivity(input, now + BACKREST_ACTIVITY_TTL_MS + 1).backrestActive, false);
  assert.equal(computeActivity(input, now + 16 * 60 * 1000).effectiveActive, false);
  input.state.lastWebhookAt = new Date(now + 16 * 60 * 1000).toISOString();
  assert.equal(computeActivity(input, now + 16 * 60 * 1000).effectiveActive, true);
});

test("the explicit emergency pause still overrides all three sources", () => {
  const input = inputs();
  Object.assign(input.state, { automationPaused: true, lastWebhookAt: stamp, lastDeviceActivityAt: stamp, backrestActive: true, lastBackrestPollAt: stamp });
  const actual = computeActivity(input, now);
  assert.equal(actual.streamingActive && actual.devicesActive && actual.backrestActive, true);
  assert.equal(actual.effectiveActive, false);
});
