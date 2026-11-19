# Tested models

Results of the model test on the [test photos](../apps/server/test-photos/README.md): CC0 / public domain photos with the dishes to recognize, item counts, a narrow kcal range and the expected confidence.

To check your model, run the test from **Settings → AI provider → Test model** in your instance, or with `check-model` from a clone of this repository:

```sh
pnpm install
AI_PROVIDER=google AI_MODEL=gemini-3.8-flash AI_API_KEY=... pnpm --filter @oct/server check-model
```

Both print the same ready row: provider, model, passed photos, date (UTC) and notes with the average time per photo, the app version, the prompt version and the test set version. It has no key or address. Copy the row and send a pull request that adds it to this table:

| Provider | Model                 | Passed | Date       | Notes                                    |
| -------- | --------------------- | ------ | ---------- | ---------------------------------------- |
| google   | gemini-3.5-flash-lite | 9/9    | 2026-11-19 | 6.8 s/photo; OCT v0.2.0, prompt 2, set 1 |

Rows of different test sets (`set N`) are not comparable: set 2 checks every dish, its count and a kcal range of ±20% (items) or ±30% (mixed dishes) around a reference portion.
