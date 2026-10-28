# Bitflow

Bitflow is a self-hosted controller for qBittorrent. It listens for Jellyfin activity and optional device presence on your network and Backrest backup activity, then switches qBittorrent between throttled and normal bandwidth profiles.

## Overview

Bitflow is built as a small Docker-first web app with a clean admin UI, persistent SQLite storage, and a background automation loop for webhook handling, ping checks, and qBittorrent state changes.

The dashboard includes an emergency pause. Pausing immediately restores the normal qBittorrent bandwidth limits and prevents webhook activity, device checks, and cooldown state from applying throttling until automation is resumed.

## Shared activity rule

Jellyfin activity **OR** network device activity **OR** a running Backrest backup
uses the same throttled upload/download profile. No source takes priority or
disables another. Ending a backup removes only its signal; other activity and
the existing inactivity cooldown can keep throttling active. Normal limits return
only once every signal and the cooldown are inactive. Emergency pause remains an
explicit override of all automation.

The throttled profile defaults to **1,024 B/s (1 KiB/s)** in both directions for
new installations. Existing configured limits are preserved. Bitflow changes
bandwidth limits; it does not pause, stop or restart torrents. Tracker accounting
and minimum-speed policies remain tracker-specific.

### Backrest connection

Under **Activity sources → Backrest**, enable monitoring, enter the direct
Backrest URL (for example `http://backrest:9898`) and the plan ID (`appdata`), test,
and save. Containers on the same Docker network can use each other's names.
Optional Basic-auth credentials are supported; the password is encrypted in
SQLite and excluded from the dashboard response. Use HTTPS when crossing an
untrusted network, and keep Bitflow's admin UI private as for its other settings.
The existing Unraid script that starts Backrest needs no new hooks or timers.

For unattended first deployment, set `BACKREST_ENABLED=true`,
`BACKREST_URL=http://backrest:9898` and `BACKREST_PLAN_ID=appdata` in the persistent
container configuration. These seed only a missing Backrest settings entry.
They never replace settings already saved through the UI, including an explicit
disable. Credentials, if needed, are configured through the UI.

Every evaluation checks Backrest's operation status. Only an in-progress backup
for the selected plan counts: queued jobs, successful/failed/cancelled jobs,
prunes and checks do not. Long backups remain active as successful polls refresh
the signal. Completion is detected on the next evaluation, then the usual
cooldown applies. This identifies the backup job's lifetime, including scanning
and finalization, rather than measuring individual network packets.

Jellyfin and device activity continue to be recorded and considered throughout.
A Backrest outage never disables them. Its last successful active observation
expires after five minutes without confirmation; the normal cooldown may retain
throttling for longer. Observations survive Bitflow restarts but their timestamps
still expire. Connection failures/recovery and backup activity changes appear in
Activity. Disabling or changing the Backrest connection clears its previous signal.

Bitflow verifies qBittorrent's actual active speed limits on evaluation and
reapplies the shared profile after a restart or external limit change. qBittorrent
rounds limits to KiB/s, so verification accepts that rounding. When applying a
profile, Bitflow disables qBittorrent's alternative-speed mode so the shared
profile is effective. It makes no torrent stop/pause API calls.

## Existing installations

The upgrade adds Backrest settings and activity columns without replacing existing
settings. Existing qBittorrent profiles, connection credentials, webhook token and
secret, devices and automation timing are preserved. Backrest monitoring starts
disabled unless explicitly enabled by first-deployment environment settings. Moving a source between pages does not save or reset it.

For Docker upgrades, retain the existing `/data` mount and `APP_ENCRYPTION_KEY` so
the same database and encrypted credentials remain usable. Back up both the data
and your container configuration before deployment. Regression tests compare all
existing setting values and device records before and after migration.

## Development checks

With Node.js 20+ and the locked dependencies installed:

```sh
npm ci
npm test
npm run build
```

Tests cover all eight signal combinations, overlapping activity, long backups,
cooldown, Backrest outages, existing-database migration, password persistence,
and qBittorrent limit reconciliation. Tests use an isolated temporary database
and mocked services; they never connect to the running Unraid deployment.

## Admin UI

The responsive admin workspace is organized around the controller's main jobs:

- **Overview** shows live Jellyfin, device, qBittorrent, and controller state with direct runtime controls.
- **qBittorrent** manages the Web API connection and normal/throttled bandwidth profiles.
- **Activity sources** groups Jellyfin webhook, Devices and Backrest settings in one sidebar entry, with a tab for each source.
- **Automation** explains the control flow and configures its timing.
- **Activity** displays the event history persisted in SQLite.

The interface uses locally owned [shadcn/ui](https://ui.shadcn.com/docs) components in `src/components/ui`, with a compact neutral design language inspired by [Qui](https://getqui.com/). Its registry configuration lives in `components.json`, so components remain composable and can be adapted without depending on a packaged UI runtime.

## Stack

Next.js, TypeScript, Tailwind CSS, shadcn/ui, Radix UI, and SQLite.

## Note

This project was created with the help of Codex.
