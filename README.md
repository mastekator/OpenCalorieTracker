# OpenCalorieTracker

Self-hosted calorie tracker that works from a photo: snap your plate, an AI vision model of your choice estimates the dishes with grams, kcal, protein, fat and carbs, you fix what's off and save it to your diary.

- **Self-hosted.** One Docker container (API + SQLite). Runs anywhere Docker runs: home server, NAS, mini PC, Raspberry Pi, VPS.
- **Pluggable AI provider.** Gemini, OpenAI, Anthropic, OpenRouter, Ollama or any OpenAI-compatible endpoint. No AI configured — enter food manually.
- **PWA.** Install it on your phone's home screen.

_Russian version of this README: coming later._

## Status

🚧 **In development.** Nothing to install yet.

## Installation (planned)

The main way to install will be Docker Compose: one container, one `/data` volume, configured with environment variables (AI provider, model, API key, public URL), behind any reverse proxy that terminates HTTPS. A ready `docker-compose.yml`, a reverse proxy example and a table of supported AI providers will land here before the first release.

## Tested models

Results of `check-model` on the [test photos](apps/server/test-photos/README.md): 9 CC0 / public domain photos with rough kcal ranges and expected confidence. To check your model, from a clone of this repository:

```sh
pnpm install
AI_PROVIDER=google AI_MODEL=gemini-2.5-flash AI_API_KEY=... pnpm --filter @oct/server check-model
```

It prints a table per photo and `N/9 passed`. Send a pull request with your row:

| Provider | Model | Passed | Date | Notes |
| -------- | ----- | ------ | ---- | ----- |
| _No results yet — run `check-model` and send a PR_ | | | | |

## Privacy

- Your diary and photo previews stay on your server.
- **Food photos are sent to the AI provider you configure.** On the **free tier of Google Gemini**, Google may use your requests to improve its products. If that matters to you, use a paid tier, another provider, a local model (e.g. Ollama), or run without AI and enter food manually.
- Photos are resized and stripped of EXIF (including location) on your phone before they leave it.

## Disclaimer

OpenCalorieTracker is **not medical advice**. Calorie and macro values from photos are estimates (often ±20–30%), and daily targets are approximate. Talk to a doctor or dietitian about your nutrition.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[AGPL-3.0](LICENSE). If you run a modified version as a service, you must publish its source.
