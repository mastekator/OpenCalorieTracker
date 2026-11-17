# Changelog

All notable changes to this project are documented in this file.

## Unreleased

## 0.1.1 — 2026-11-17

Fixes after the first installs.

- AI provider: clear "model not found" and timeout states; Gemini uses the least thinking, so photos are recognized faster
- The sign-in screen names the exact setup error instead of a generic one
- Phone: the meal edit footer stays at the bottom edge; no blurred patch under the iOS status bar
- Desktop: nested settings screens in one column, no duplicate invite action
- Docker: runs as `PUID:PGID` and keeps data in a `./data` folder next to `docker-compose.yml`, with a Synology guide

### Upgrade from 0.1.0

Set `image: ghcr.io/mastekator/opencalorietracker:0.1.1` in `docker-compose.yml`, then `docker compose pull && docker compose up -d`. The named volume from 0.1.0 keeps working; to move data into a folder, see [Moving from a named volume to a folder](docs/SELF_HOSTING.md#moving-from-a-named-volume-to-a-folder).

## 0.1.0 — 2026-11-17

First release.

- Food from a photo, the photo library, or drag and paste on desktop, recognized by the AI provider you connect; manual entry without AI
- Edit names and portions, add or remove dishes, recalculate
- Today, diary by day, week and month charts
- Daily goal from your body data, with a step-by-step explanation, or your own numbers
- Set your goal in a form or by chatting with the goal assistant (needs AI)
- Weight log with trend
- Metric and US units
- Passkeys and passwords, invites, admin
- Install to home screen, works offline, light and dark
- English and Russian
- One Docker image for amd64 and arm64, SQLite in one volume
