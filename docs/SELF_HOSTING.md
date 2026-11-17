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

### Data folder and its owner

The database and photos are kept in `./data` next to `docker-compose.yml`. The app runs as the user and group set by `PUID` and `PGID` in `.env` (default `1000`): at every start it gives `./data` to them, then drops root before doing anything else. Set them to the account that owns the folder on the host — `id` prints its numbers:

```sh
$ id
uid=1026(alice) gid=100(users) ...
```

```
PUID=1026
PGID=100
```

If the folder cannot be written (for example, a network share that refuses ownership changes), the log says `data_dir_not_writable` and the sign-in screen explains it. Then set `PUID`/`PGID` to the folder's current owner, or give that user write access to the folder. Running the container with Compose `user: "1026:100"` instead of `PUID`/`PGID` also works, but then the folder must already be writable by that user.

**Named volume instead of a folder.** If you prefer Docker to manage the storage, replace `./data:/data` with `oct-data:/data` in `docker-compose.yml` and add at the end:

```yaml
volumes:
  oct-data:
```

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

`docker-compose.yml` pins a version (e.g. `:0.1.1`), so nothing changes until you edit the tag. `:latest` points to the newest release and `:0.1` to the newest `0.1.x`: with them every `docker compose pull` may bring a new version, migrations included, without you reading its changelog. Rolling back after a migration needs a backup, so a pinned version is recommended.

### Backup and restore

Everything (database and photos) is in the `data` folder. Back it up with the container stopped, so the database is not copied in the middle of a write:

```sh
docker compose stop
tar czf oct-backup.tgz -C data .
docker compose start
```

Restore:

```sh
docker compose stop
rm -rf data && mkdir data && tar xzf oct-backup.tgz -C data
docker compose start
```

Run these as the folder's owner or with `sudo`; the app fixes the owner on start.

### Moving from a named volume to a folder

Installations from 0.1.0 keep data in the Docker volume `opencalorietracker_oct-data` (the prefix is the directory name; check with `docker volume ls`). To move it into `./data`, next to `docker-compose.yml`:

```sh
docker compose down
mkdir -p data
docker run --rm -v opencalorietracker_oct-data:/from -v "$PWD/data":/to alpine cp -a /from/. /to/
```

Then in `docker-compose.yml` change `- oct-data:/data` to `- ./data:/data` and delete the `volumes:` section at the end (or take the current `docker-compose.yml` and set your version tag), add `PUID`/`PGID` to `.env`, and start with `docker compose up -d`. Once you have signed in and seen your diary, remove the old volume: `docker volume rm opencalorietracker_oct-data`.

### Synology and other NAS

Written for Synology DSM 7.2 with Container Manager; other NAS systems with Docker Compose follow the same steps.

1. **Folder.** In File Station create `docker/opencalorietracker` (e.g. `/volume1/docker/opencalorietracker`). Put `docker-compose.yml` and `.env` from [Start](#start) there and fill in `.env`. The `data` subfolder is created on the first start.
2. **User.** Set `PUID` and `PGID` in `.env` to the DSM user who should own the files. Over SSH, `id` prints them; the first user created on DSM is usually `1026`, the `users` group is `100`.
3. **Project.** Container Manager → Project → Create: name `opencalorietracker`, path — the folder above, source — use the existing `docker-compose.yml`. Finish to start it. The project log shows the same messages as `docker compose logs`.
4. **HTTPS.** Control Panel → Login Portal → Advanced → Reverse Proxy → Create: source `HTTPS`, your domain, port `443`; destination `HTTP`, `localhost`, port `3000`. Then Control Panel → Security → Certificate → Add → Let's Encrypt for that domain, and under Settings assign it to the reverse proxy entry. `TRUST_PROXY_HOPS=1`, `PUBLIC_URL=https://` plus your domain.
5. **Backup.** In Hyper Backup include `docker/opencalorietracker` (the `data` folder holds everything). Schedule it for a quiet hour: a copy taken while someone is saving food may need the previous backup version; stopping the project for the backup avoids that.
6. **Updating.** Container Manager → Project → Stop, edit the tag in `docker-compose.yml` (Project → YAML), then Build — it pulls the new image and starts it.

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
| `AI_MODEL`         | —                    | Model id at that provider, e.g. `gemini-3.8-flash`. Required with `AI_PROVIDER`.                                                             |
| `AI_API_KEY`       | —                    | API key of the provider. Never logged.                                                                                                       |
| `AI_BASE_URL`      | —                    | Endpoint URL; required for `openai-compatible`, e.g. `http://ollama:11434/v1`.                                                               |
| `DATA_DIR`         | `/data` in the image | Where the SQLite database and photos live. Mount a folder or volume here.                                                                    |
| `PUID`, `PGID`     | `1000`               | User and group the app runs as and gives the data folder to. See [Data folder and its owner](#data-folder-and-its-owner).                    |
| `PORT`             | `3000`               | HTTP port inside the container.                                                                                                              |
| `HOST`             | `0.0.0.0`            | Address to listen on.                                                                                                                        |
| `WEB_DIST`         | set by the image     | Built web app directory; change only for development.                                                                                        |

Configuration problems (bad `PUBLIC_URL`, missing admin settings, a data folder it cannot write) do not stop the server: they are printed in the log at startup and shown on the sign-in screen.

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
