# Changelog

All notable changes to this project are documented in this file.

## Unreleased

## 0.2.0 — 2026-11-19

AI settings in the app, refining what the AI recognized, and a setup wizard.

- Refine a meal: "Recognize again", or tell the AI what to fix in words; the AI asks short questions under unsure dishes, answered with one tap; an admin sets how many refinements a meal gets
- Settings → AI provider for the admin: provider, key and model without editing `.env` or restarting; pick the model from the provider's list, with photo support and price
- Test a model on built-in sample photos and compare the last 20 runs, with a ready row for [Tested models](docs/MODELS.md)
- First-run wizard: create the admin in the browser with a one-time setup code from the log; `ADMIN_EMAIL` and `ADMIN_PASSWORD` are now optional
- Fixes: our own "AI unavailable" no longer shows the "server is down" banner; a saved API key is sent only to its own address

### Upgrade from 0.1.x

Set `image: ghcr.io/mastekator/opencalorietracker:0.2.0` in `docker-compose.yml`, then `docker compose pull && docker compose up -d`. Nothing else is required: the existing admin and the `AI_*` variables keep working. While `AI_PROVIDER` is set in `.env`, it overrides Settings → AI provider; remove the `AI_*` variables to manage AI in the app. The saved key is encrypted with `data/secret.key`, created on the first start: keep it in your backups together with the database.

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
