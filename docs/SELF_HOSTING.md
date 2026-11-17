# Self-hosting OpenCalorieTracker

How to install and configure your own OpenCalorieTracker server. For what the app does, see the [README](../README.md).

## Installation

### Requirements

- Docker with the Compose plugin, on an x86-64 or arm64 machine (home server, NAS, Raspberry Pi, VPS).
- A domain name pointing at that machine, and a reverse proxy with HTTPS in front of the container (see [below](#reverse-proxy-and-https)).

### Start

```sh
mkdir opencalorietracker && cd opencalorietracker
curl -O https://raw.githubusercontent.com/mastekator/OpenCalorieTracker/main/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/mastekator/OpenCalorieTracker/main/.env.example
```

Edit `.env`: set `PUBLIC_URL` to the exact address users will open (e.g. `https://food.example.com`), and `ADMIN_EMAIL` and `ADMIN_PASSWORD` for the first admin. Then:

```sh
docker compose up -d
docker compose logs
```

The log lists any configuration problems, and the sign-in page names the first one (never the values). In `.env`, avoid `$`, `#` and quotes in a value, or wrap the whole value in single quotes. After editing `.env`, recreate the container with `docker compose up -d`.

The container listens on `127.0.0.1:3000` only; users reach it through the reverse proxy.

### First sign-in

Open `PUBLIC_URL` and sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`. The admin is created only on the first start with an empty database; afterwards both variables are ignored, so change the password in the app and, if you like, add a passkey. Invite other users from the admin section.

### AI provider

AI recognizes food on photos and runs the goal assistant. It is optional: without it, food is entered by hand. Set the `AI_*` variables in `.env` and run `docker compose up -d` again.

- **Cloud model:** `AI_PROVIDER` (`google`, `openai`, `anthropic` or `openrouter`), `AI_MODEL` and `AI_API_KEY` from the provider's console.
- **Local model** (Ollama, LM Studio or any OpenAI-compatible server): `AI_PROVIDER=openai-compatible`, `AI_MODEL`, and `AI_BASE_URL`, e.g. `http://ollama:11434/v1` when Ollama runs in the same Compose project. `AI_API_KEY` only if the server asks for one.

The model must read images. Which ones work well: [Tested models](MODELS.md).

### Reverse proxy and HTTPS

Passkeys work only over HTTPS and only on the exact domain in `PUBLIC_URL`, and invite and recovery links are built from it. So the proxy must serve the app over HTTPS at that address, and `PUBLIC_URL` must match what users type, scheme and port included. Plain `http://` is accepted only for `http://localhost`.

A minimal [Caddy](https://caddyserver.com/docs/quick-starts/reverse-proxy) setup on the same host gets a certificate automatically. `Caddyfile`:

```
food.example.com {
	reverse_proxy 127.0.0.1:3000
}
```

If Caddy runs in its own container, `127.0.0.1:3000` is not reachable from it: put both containers on one Docker network and use `reverse_proxy opencalorietracker:3000`.

Other proxies: [nginx](https://nginx.org/en/docs/http/ngx_http_proxy_module.html), [Traefik](https://doc.traefik.io/traefik/routing/providers/docker/), [Synology DSM reverse proxy](https://kb.synology.com/en-global/DSM/help/DSM/AdminCenter/system_login_portal_advanced). Whatever you use, keep [`TRUST_PROXY_HOPS`](#trust_proxy_hops-the-real-client-ip) equal to the number of proxies.

### Updating

Read the [changelog](../CHANGELOG.md), set the new version tag in `image:` in `docker-compose.yml`, then:

```sh
docker compose pull
docker compose up -d
```

Database migrations run on start. Back up first.

### Backup and restore

Everything (database and photos) is in the `/data` volume. Compose prefixes the volume name with the project name, by default the directory name: with the steps above it is `opencalorietracker_oct-data` (check with `docker volume ls`). Back up with the container stopped:

```sh
docker compose stop
docker run --rm -v opencalorietracker_oct-data:/data -v "$PWD":/b alpine tar czf /b/oct-backup.tgz -C /data .
docker compose start
```

Restore into the same volume:

```sh
docker compose stop
docker run --rm -v opencalorietracker_oct-data:/data -v "$PWD":/b alpine sh -c 'rm -rf /data/* && tar xzf /b/oct-backup.tgz -C /data'
docker compose start
```

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
