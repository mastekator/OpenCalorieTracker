# Tested models

Results of the model test on the [test photos](../apps/server/test-photos/README.md): 9 CC0 / public domain photos with rough kcal ranges and expected confidence.

To check your model, run the test from **Settings → AI provider → Test model** in your instance, or with `check-model` from a clone of this repository:

```sh
pnpm install
AI_PROVIDER=google AI_MODEL=gemini-3.8-flash AI_API_KEY=... pnpm --filter @oct/server check-model
```

Both print the same ready row: provider, model, passed photos, date (UTC) and notes with the average time per photo, the app version and the prompt version. It has no key or address. Copy the row and send a pull request that adds it to this table:

| Provider                                           | Model | Passed | Date | Notes |
| -------------------------------------------------- | ----- | ------ | ---- | ----- |
| _No results yet — run `check-model` and send a PR_ |       |        |      |       |
