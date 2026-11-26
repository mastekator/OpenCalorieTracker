# Changelog

All notable changes to this project are documented in this file.

## Unreleased

## 0.4.0 — 2026-11-26

Integrations, diary import and export, edible part of products and recipe ingredients by photo.

### Integrations

- Personal API tokens and a read-only public API `/api/v1` (days, meals, totals in your time zone); the admin can turn tokens off (`ALLOW_API_TOKENS`)
- Webhooks for meal changes and the timed events `day.closed` and `day.empty`: signed deliveries, retries, delivery log, test send, secret rotation, auto-disable after repeated failures
- Read-only MCP server on `/mcp` for AI assistants, switched on per user
- Integrations hub that gathers tokens, webhooks, MCP, import and export

### Import and export

- Export the diary as JSON, CSV or a ZIP with photos
- Import from MyFitnessPal, Cronometer or any CSV: column mapping, preview, import history and undo of an import

### Edible part

- The AI reads the gross weight; the edible share (peeled / whole) is picked from a USDA refuse reference, and you can change the percentage in the dish sheet

### Recipes

- Add ingredients by photo (up to 5 photos, up to 50 ingredients), by barcode or by hand with «how much you used»
- Whole pieces on estimated ingredients, for example «3 pcs ≈ 55 g»

### Sync

- Offline edits that conflict with a change made on another device are kept: you choose which version to keep

### Fixes

- Page scroll is locked behind an open sheet; focus returns to the row or button that opened a sheet
- Button rows no longer wrap into each other on desktop and in the recipe screen
- Weight chart axis starts at the first weighing
- CSV export cells are guarded against spreadsheet formulas; `/mcp` batch size is capped; webhook test sends are rate-limited

### Upgrade from 0.3.2

Set `image: ghcr.io/mastekator/opencalorietracker:0.4.0` in `docker-compose.yml`, then `docker compose pull && docker compose up -d`. Database migrations run on start. New optional variable: `ALLOW_API_TOKENS` (see `.env.example`).

## 0.3.2 — 2026-11-22

Fix for Google Gemini after 0.3.1.

- Photo recognition, label reading and the model test work again with Google Gemini: the AI response schema no longer has optional fields, which Gemini rejected with a 400
- When an AI provider rejects a request, the server log now shows the provider's error text (cut, keys masked)

### Upgrade from 0.3.1

Set `image: ghcr.io/mastekator/opencalorietracker:0.3.2` in `docker-compose.yml`, then `docker compose pull && docker compose up -d`. No database migrations; nothing else is required.

## 0.3.1 — 2026-11-21

Fixes after 0.3.0: barcodes, drinks, package portions and photos.

- The recognition screen opens right after taking a photo, before the upload finishes
- Barcodes: the scanned code is checked against the digits the AI reads on the label; when they differ, the other code is offered in the dish sheet
- Pet food in a photo is no longer logged as food
- Drinks are counted in ml (fl oz with US units); a g / ml switch in manual entry and in your own product form
- How much you ate of a package: packages, servings, pieces or grams; the package weight comes from Open Food Facts or is asked once, and the last choice is remembered per barcode
- Meal and recipe photos open full screen at full size, so saving a photo no longer saves the thumbnail
- «Recipe from text» is offered in the empty kitchen and marked as AI

### Upgrade from 0.3.0

Set `image: ghcr.io/mastekator/opencalorietracker:0.3.1` in `docker-compose.yml`, then `docker compose pull && docker compose up -d`. Database migrations run on start; back up the `data` folder first. Nothing else is required.

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
