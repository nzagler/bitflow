# Bitflow

Bitflow is a self-hosted controller for qBittorrent. It listens for Jellyfin activity and optional device presence on your network, then switches qBittorrent between throttled and normal bandwidth profiles.

## Overview

Bitflow is built as a small Docker-first web app with a clean admin UI, persistent SQLite storage, and a background automation loop for webhook handling, ping checks, and qBittorrent state changes.

The dashboard includes an emergency pause. Pausing immediately restores the normal qBittorrent bandwidth limits and prevents webhook activity, device checks, and cooldown state from applying throttling until automation is resumed.

## Stack

Next.js, TypeScript, Tailwind CSS, and SQLite.

## Note

This project was created with the help of Codex.
