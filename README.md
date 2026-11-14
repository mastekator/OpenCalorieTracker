# OpenCalorieTracker

Self-hosted calorie tracker that works from a photo: snap your plate, an AI vision model of your choice estimates the dishes with grams, kcal, protein, fat and carbs, you fix what's off and save it to your diary.

- **Self-hosted.** One Docker container (API + SQLite). Runs anywhere Docker runs: home server, NAS, mini PC, Raspberry Pi, VPS.
- **Pluggable AI provider.** Gemini, OpenAI, Anthropic, OpenRouter, Ollama or any OpenAI-compatible endpoint. No AI configured — enter food manually.
- **PWA.** Install it on your phone's home screen.

## Status

🚧 **In development.** Nothing to install yet.

## Installation (planned)

The main way to install will be Docker Compose: one container, one `/data` volume, behind any reverse proxy that terminates HTTPS. A ready `docker-compose.yml` and a reverse proxy example will land here before the first release.

## Configuration

All settings are environment variables. An empty value (`KEY=`) counts as not set.

| Variable           | Default              | Meaning                                                                                                                                      |
| ------------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_URL`       | —, required          | The origin users open, e.g. `https://food.example.com`. HTTPS is required except for `http://localhost`; no path. See below.                 |
| `ADMIN_EMAIL`      | —                    | Admin account, created on the first start with an empty database. Ignored afterwards.                                                        |
| `ADMIN_PASSWORD`   | —                    | Admin password for that first start (when password sign-in is on): 8–128 characters with a letter, a digit and a symbol. Ignored afterwards. |
| `AUTH_METHODS`     | `password,passkey`   | Enabled sign-in methods: `password`, `passkey` or both, comma-separated. See below before changing it.                                       |
| `REGISTRATION`     | `invite`             | Who can sign up: `invite` (by admin invite link only) or `open`.                                                                             |
| `TRUST_PROXY_HOPS` | `1`                  | How many reverse proxies stand in front of the server. See below.                                                                            |
| `AI_PROVIDER`      | —                    | `google`, `openai`, `anthropic`, `openrouter` or `openai-compatible` (Ollama, LM Studio, etc.). Not set: no AI, food is entered manually.    |
| `AI_MODEL`         | —                    | Model id at that provider, e.g. `gemini-2.5-flash`. Required with `AI_PROVIDER`.                                                             |
| `AI_API_KEY`       | —                    | API key of the provider. Never logged.                                                                                                       |
| `AI_BASE_URL`      | —                    | Endpoint URL; required for `openai-compatible`, e.g. `http://ollama:11434/v1`.                                                               |
| `DATA_DIR`         | `/data` in the image | Where the SQLite database and photos live. Mount a volume here.                                                                              |
| `PORT`             | `3000`               | HTTP port inside the container.                                                                                                              |
| `HOST`             | `0.0.0.0`            | Address to listen on.                                                                                                                        |
| `WEB_DIST`         | set by the image     | Built web app directory; change only for development.                                                                                        |

Configuration problems (bad `PUBLIC_URL`, missing admin settings) do not stop the server: they are printed in the log at startup and shown on the sign-in screen.

### `PUBLIC_URL`: choose it once

Passkeys are bound to the domain in `PUBLIC_URL`, and invite and recovery links are built from it. Pick the final address before users sign up. If you change it later:

- every passkey stops working — users sign in with a password, or with a recovery link from the admin if passwords are off; the admin uses [`reset-admin-access`](#locked-out-reset-admin-access);
- after signing in, users remove the old passkeys in settings and add new ones;
- invite and recovery links issued before the change point to the old address — issue new ones.

Accounts and all data stay.

### `TRUST_PROXY_HOPS`: the real client IP

Sign-in protection (timeouts and blocks after failed attempts) counts per client IP, which the server takes from the `X-Forwarded-For` header written by your reverse proxies. Set the variable to the number of proxies in front of the container: `0` if users connect to it directly, `1` for one reverse proxy, `2` for two in a chain (for example, a tunnel service plus a local proxy).

- **Too low** — the server sees a proxy's address instead of the user's. Symptom: in the admin's list of blocks all entries have the same IP, and one user's failed attempts lock everyone out.
- **Too high** — the server trusts a header the client can forge, so an attacker can bypass the limits by sending a fake `X-Forwarded-For`.

### Locked out: `reset-admin-access`

If the admin cannot sign in (forgotten password, lost passkey, blocked IP or device), run in the running container:

```sh
docker exec <container> node dist/cli.js reset-admin-access
```

It lifts all sign-in blocks and timeouts and prints one admin recovery link, valid for 24 hours. Opening it lets you set a new password or add a passkey; your data and sessions stay. A previous unused admin recovery link stops working. The server keeps running meanwhile.

### Changing `AUTH_METHODS`

You can switch methods at any time by changing the variable and restarting. Users whose only sign-in method was turned off can no longer sign in: at startup the log warns how many such users there are. Give each of them a recovery link from the admin's user list; with it they set up a method that is enabled. If the admin is one of them, use `reset-admin-access`.

## Tested models

Results of `check-model` on the [test photos](apps/server/test-photos/README.md): 9 CC0 / public domain photos with rough kcal ranges and expected confidence. To check your model, from a clone of this repository:

```sh
pnpm install
AI_PROVIDER=google AI_MODEL=gemini-2.5-flash AI_API_KEY=... pnpm --filter @oct/server check-model
```

It prints a table per photo and `N/9 passed`. Send a pull request with your row:

| Provider                                           | Model | Passed | Date | Notes |
| -------------------------------------------------- | ----- | ------ | ---- | ----- |
| _No results yet — run `check-model` and send a PR_ |       |        |      |       |

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
