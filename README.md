# Bitflow

Bitflow is a self-hosted controller for qBittorrent. It listens for Jellyfin activity and optional device presence on your network, then switches qBittorrent between throttled and normal bandwidth profiles.

## Overview

Bitflow is built as a small Docker-first web app with a clean admin UI, persistent SQLite storage, and a background automation loop for webhook handling, ping checks, and qBittorrent state changes.

The dashboard includes an emergency pause. Pausing immediately restores the normal qBittorrent bandwidth limits and prevents webhook activity, device checks, and cooldown state from applying throttling until automation is resumed.

## Admin UI

The responsive admin workspace is organized around the controller's main jobs:

- **Overview** shows live Jellyfin, device, qBittorrent, and controller state with direct runtime controls.
- **qBittorrent** manages the Web API connection and normal/throttled bandwidth profiles.
- **Jellyfin webhook** provides the callback URL, authentication settings, and signal health.
- **Devices** manages optional network-presence checks.
- **Automation** explains the control flow and configures its timing.
- **Activity** displays the event history persisted in SQLite.

The interface uses locally owned [shadcn/ui](https://ui.shadcn.com/docs) components in `src/components/ui`, with a compact neutral design language inspired by [Qui](https://getqui.com/). Its registry configuration lives in `components.json`, so components remain composable and can be adapted without depending on a packaged UI runtime.

## Stack

Next.js, TypeScript, Tailwind CSS, shadcn/ui, Radix UI, and SQLite.

## Note

This project was created with the help of Codex.
