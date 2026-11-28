# Security policy

## Supported versions

Only the latest minor release (and its patch releases) gets security fixes. Older releases are not patched: update to the latest image.

## Reporting a vulnerability

Please report it privately, not in a public issue:

1. Open [Report a vulnerability](https://github.com/mastekator/OpenCalorieTracker/security/advisories/new) on the repository's **Security** tab.
2. Describe the version, what an attacker can do, and the steps to reproduce it.

What to expect: this is a small project with one maintainer, so answers are best effort. We aim to acknowledge a report within 7 days, agree on the severity with you, and publish a fix and an advisory before the details go public. We credit you in the advisory unless you ask us not to.

## What counts as a vulnerability

OpenCalorieTracker is self-hosted: you run the server, so its safety also depends on how it is set up.

**A vulnerability in the app**, please report:

- one user reading or changing another user's data, or a user doing what only the admin can;
- signing in or keeping access without valid credentials, for example after a password reset, a revoked token or a deleted passkey;
- the server making requests it should refuse (see [outgoing requests](#outgoing-requests)), or leaking secrets (AI keys, tokens, webhook secrets) in answers or logs;
- XSS, injection, or anything else that runs code or queries an attacker controls.

**Not an app vulnerability**, a matter of the server's setup:

- serving the app without HTTPS, or a `PUBLIC_URL` that does not match the real address;
- a leaked copy of the `data` folder: it holds the database and `secret.key`, which decrypts the saved AI keys ([backups](docs/SELF_HOSTING.md));
- an exposed host, Docker socket or reverse proxy, or a weak admin password;
- what the AI provider you chose does with the photos sent to it.

## Protections in the code

These are what the code actually does; nothing beyond them is promised.

- **Sessions.** The session cookie is `HttpOnly`, `SameSite=Strict` and `Secure` (except on `http://localhost`). Only a hash of the session token is stored. Failed sign-ins are throttled per IP and per device.
- **Passwords** are hashed with scrypt.
- **Secrets at rest.** AI keys and the ChatGPT sign-in are encrypted with AES-256-GCM using `data/secret.key`.
- **API tokens.** Personal tokens (`read` or `write` scope) are stored as hashes, can expire, can be revoked, are limited to 60 requests per minute each, and work only on `/api/v1` and `/mcp`. The admin can turn tokens off for the whole installation.
- **Webhooks** are signed with HMAC-SHA256 over the timestamp and the raw body, so the receiver can check them ([details](docs/webhooks.md#signature)).
- <a id="outgoing-requests"></a>**Outgoing requests (SSRF).** A webhook address is resolved again on every delivery and nothing is sent to loopback, link-local, `0.0.0.0/8` or multicast addresses; plain `http://` is allowed only for home-network addresses. A user's own AI address must be public `https` and may not resolve to a private address. Redirects are not followed. The admin can turn off outgoing requests to outside services.
- **Photos.** The browser re-encodes a photo before upload, which drops EXIF data, including location.
- **No telemetry.** The app collects no usage data and sends nothing anywhere except to the AI provider and outside services you set up.
