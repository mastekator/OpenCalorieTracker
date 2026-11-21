# Changelog

All notable changes to this project are documented in this file.

## Unreleased

## 0.3.0 — 2026-11-21

Faster logging: recipes and barcodes.

- Kitchen: recipes with ingredients, yield, steps and photo, or just calories per 100 g when the ingredients are unknown; weights in grams or ounces as set in your profile
- Log a portion of a recipe from its card, from «Done!» after cooking, from manual entry or «+ Add dish»; a «Your recipe» hint suggests a saved recipe for a recognized dish, and the AI can offer your recipes as answers to its questions
- Save a meal as a recipe, or start a recipe «From a meal»
- Recipe from text: paste a recipe and the AI fills in the editor
- Make it lighter: the AI suggests a lighter version of a recipe, saved as a new one
- Barcodes: read from a photo or typed in manual entry, looked up in Open Food Facts, merged with what the AI recognized; your own products are remembered and work offline. A label photo fills in the product
- Outside requests (barcode lookup) can be turned off by each user and by the admin; `ALLOW_OUTBOUND_REQUESTS` in `.env` overrides the admin switch
- Fixes: a recipe saved from an older copy no longer overwrites newer edits; saving a lighter copy of a recipe with a photo works; several layout fixes on desktop

### Upgrade from 0.2.x

Set `image: ghcr.io/mastekator/opencalorietracker:0.3.0` in `docker-compose.yml`, then `docker compose pull && docker compose up -d`. Database migrations run on start; back up the `data` folder first. Nothing else is required.

## 0.2.1 — 2026-11-19

Fixes after 0.2.0, a stricter model test, and the first part of recipes.

- Model test checks what was recognized, not only the calorie total: every expected dish must be found, countable items are counted, calories must be close to a reference portion; every reason a photo failed is shown. The set has a version and more photos; older results in [Tested models](docs/MODELS.md) are marked `set 1`
- Model comparison: model names on one line, the dishes a model returned are shown, clearer thumbnails
- AI provider: Save right after Check no longer asks to wait
- Goal assistant: with a filled profile it first confirms what it knows, and the deadline question names the target weight
- iPhone: no empty bar above the large title on the main screens
- Add a photo to a saved meal that has none, with upload progress and retry
- Kitchen (early): recipes with ingredients, yield, steps and photo, and a cooking mode with the screen kept on. Logging a portion from a recipe and more are coming in 0.3

### Upgrade from 0.2.0

Set `image: ghcr.io/mastekator/opencalorietracker:0.2.1` in `docker-compose.yml`, then `docker compose pull && docker compose up -d`. Database migrations run on start; back up the `data` folder first.

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
