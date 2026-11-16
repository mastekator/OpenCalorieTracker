# Tested models

Results of `check-model` on the [test photos](../apps/server/test-photos/README.md): 9 CC0 / public domain photos with rough kcal ranges and expected confidence. To check your model, from a clone of this repository:

```sh
pnpm install
AI_PROVIDER=google AI_MODEL=gemini-2.5-flash AI_API_KEY=... pnpm --filter @oct/server check-model
```

It prints a table per photo and `N/9 passed`. Send a pull request with your row:

| Provider                                           | Model | Passed | Date | Notes |
| -------------------------------------------------- | ----- | ------ | ---- | ----- |
| _No results yet — run `check-model` and send a PR_ |       |        |      |       |
