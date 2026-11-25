# Webhooks

A webhook makes your installation call a URL of yours when something happens in your diary:
a notification on your phone, a light in Home Assistant, a row in your own script.

Set them up in the app: **Settings → Integrations → Webhooks**. When you create a webhook,
the app shows its **secret** once; keep it to check that requests really come from your installation.
**New secret** replaces it; the old one stops working at once.

## Address

- `https://` works for any host.
- Plain `http://` works only for your home network: `10.*`, `172.16–31.*`, `192.168.*`, `fc00::/7`,
  and names ending in `.lan`, `.local` or `.home.arpa`. Otherwise saving answers `400 http_not_private`.
- On every delivery the name is resolved again. If any address it resolves to is loopback (`127.*`, `::1`),
  link-local (`169.254.*`, `fe80::/10`), `0.0.0.0/8` or multicast, nothing is sent and the log says `blocked_address`.
- Redirects are not followed: a `3xx` answer is logged with its status and counts as a failure.
- The whole request, answer included, must finish in 10 seconds (`timeout`). The answer body is ignored.
- The administrator can turn off outgoing requests for the whole installation. Then **Send test** and saving
  an enabled webhook answer `403 outbound_disabled`.
- **Send test** works 10 times a minute per user; past that it answers `429 too_many_attempts` with `Retry-After`.

**For the administrator.** Any user of the installation can point a webhook at an address in the server's local
network, and the delivery log shows whether that address answered, refused or timed out. This is on purpose, so
webhooks reach Home Assistant or n8n at home. If you don't want users to reach your local network, turn off outgoing
requests in the admin settings or set `ALLOW_OUTBOUND_REQUESTS=false`. This stops all webhooks, not only the ones
to local addresses.

## Request

`POST` with a JSON body and these headers:

| Header            | Value                                                 |
| ----------------- | ----------------------------------------------------- |
| `Content-Type`    | `application/json`                                    |
| `X-OCT-Event`     | the event, e.g. `meal.saved`                          |
| `X-OCT-Delivery`  | the delivery id, the same in every retry of one event |
| `X-OCT-Signature` | `t=<unix seconds>,v1=<hex HMAC-SHA256>`, see below    |

Body:

```json
{
  "version": 1,
  "id": "42",
  "event": "meal.saved",
  "occurredAt": "2026-11-25T12:00:00.000Z",
  "user": { "id": 7 },
  "data": {}
}
```

- `id` — an opaque string, equal to `X-OCT-Delivery`. Use it to drop a repeated delivery.
- `event` — one of:
  - `meal.saved` — a meal was saved, changed or deleted; `data` has the date, the meal and its dishes
    with grams, kcal, protein, fat and carbs. No photos and no email.
  - `day.closed` — at the time you chose (23:59 by default) in your time zone; `data` has the day's totals,
    your target and what is left.
  - `day.empty` — nothing was logged by the time you chose; `data` has the date.
  - `test` — **Send test** in the app; `data` is `{}`.
- Any `2xx` answer is a success. A failed event is retried 3 times (after 30 s, 2 min and 10 min).
  After 20 failed events in a row the webhook is switched off; switching it on again starts the count over.
- The app keeps the last 20 deliveries of each webhook in its log.

### `meal.saved`

`data.action` is `created`, `updated` or `deleted`. A deleted meal has only its id, `clientId`, `date` and `mealType`.
Each webhook gets its own `id` for the same event. Saving does not wait for the delivery: events go out
from a queue within a few seconds. Meals added by an import do not send events.

```json
{
  "action": "created",
  "meal": {
    "id": 128,
    "clientId": "5b1e0c9a-3f7d-4c1e-9a52-0f6d2c8e7b41",
    "date": "2026-11-25",
    "mealType": "lunch",
    "eatenAt": "2026-11-25T09:30:00.000Z",
    "items": [
      {
        "name": "Buckwheat with chicken",
        "grams": 280,
        "unit": "g",
        "kcal": 410,
        "proteinG": 30,
        "fatG": 10,
        "carbsG": 50
      }
    ],
    "kcal": 410,
    "proteinG": 30,
    "fatG": 10,
    "carbsG": 50
  }
}
```

`date` is the diary day of the meal, `mealType` is `breakfast`, `lunch`, `dinner` or `snack`.

### `day.closed` and `day.empty`

Both go out at most once a local day, at the time you chose in your time zone (the server's zone if
you did not set one). The app checks the clock once a minute, so an event may come up to a minute
late. If the check for yesterday was missed (the server was off or busy at the chosen time), the
event for yesterday, with yesterday's date, goes on the next check; older days are not caught up,
nor days before the webhook was created. Moving the time later on a day whose event has already gone does not send it again.

`day.closed` has the day's totals, your target (`null` without one) and what is left:

```json
{
  "date": "2026-11-25",
  "eaten": { "kcal": 1840, "proteinG": 96, "fatG": 61, "carbsG": 210 },
  "norm": { "kcal": 2100, "proteinG": 120, "fatG": 70, "carbsG": 240 },
  "remaining": { "kcal": 260, "proteinG": 24, "fatG": 9, "carbsG": 30 }
}
```

`day.empty` is `{ "date": "2026-11-25" }`. It goes only if no meal of that day exists at the chosen
time; once that time has passed with a meal logged, the day is settled and deleting the meal later
does not send it.

## Signature

`v1` is the hex HMAC-SHA256 of the string `<t>.<body>`:

- the key is the secret exactly as the app showed it, as UTF-8 bytes (do not base64-decode it);
- `t` is the number from the same header;
- `body` is the raw request body, byte for byte — check it before parsing the JSON.

Reject a request whose `t` is more than 5 minutes away from your clock: that stops a replay of an old request.

Reference values — your code must give the same `v1`:

```
secret:    3q2-7wAAAAA3q2-7wAAAAA3q2-7wAAAAA3q2-7wAAAA
t:         1795608000
body:      {"version":1,"id":"test-5f0c8a2e","event":"test","occurredAt":"2026-11-25T12:00:00.000Z","user":{"id":7},"data":{}}
signature: t=1795608000,v1=95d60197cbc1d2afd15789da86d025df6b4e7a0ae4e5cbe08fc068dea77458c5
```

### Python

```python
import hashlib, hmac, time

def verify(secret: str, header: str, body: bytes, tolerance: int = 300) -> bool:
    parts = dict(p.split("=", 1) for p in header.split(","))
    t = parts.get("t", "")
    if not t.isdigit() or abs(time.time() - int(t)) > tolerance:
        return False
    expected = hmac.new(secret.encode(), t.encode() + b"." + body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, parts.get("v1", ""))
```

### JavaScript (Node.js)

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verify(secret, header, body, tolerance = 300) {
  const parts = Object.fromEntries(
    header.split(',').map((p) => p.split('=', 2)),
  );
  const t = Number(parts.t);
  if (!Number.isInteger(t) || Math.abs(Date.now() / 1000 - t) > tolerance)
    return false;
  // body: the raw request body as a string or Buffer, before JSON.parse.
  const expected = createHmac('sha256', secret)
    .update(`${t}.`)
    .update(body)
    .digest('hex');
  const got = String(parts.v1 ?? '');
  return (
    got.length === expected.length &&
    timingSafeEqual(Buffer.from(got), Buffer.from(expected))
  );
}
```

## Example: ntfy

[ntfy](https://ntfy.sh) turns a request into a phone notification. Use your topic's URL as the webhook address,
for example `https://ntfy.sh/my-secret-topic` (or `http://ntfy.lan/food` for your own server at home).
The notification shows the JSON body; ntfy's message templates can turn it into a short line.
ntfy does not check the signature, so pick a topic name nobody can guess.

## Example: Home Assistant

Add an automation with a webhook trigger:

```yaml
# automations.yaml
- alias: Meal logged
  triggers:
    - trigger: webhook
      webhook_id: oct-meal-logged-7f3a
      allowed_methods: [POST]
      local_only: true
  actions:
    - action: notify.notify
      data:
        message: 'Meal logged: {{ trigger.json.event }}'
```

The webhook address is `http://homeassistant.local:8123/api/webhook/oct-meal-logged-7f3a`.
Home Assistant does not check the signature either: the long `webhook_id` is the password, keep it private.
