# Public API v1

A small, stable HTTP API for scripts and home automation: read your diary and log a meal. AI assistants can read it through [MCP](#mcp).
It lives under `/api/v1` on your installation (for example `https://food.example.com/api/v1`).
Incompatible changes never land in `v1`; they would come as `/api/v2` next to it.

## Authentication

Create a personal access token in the app: **Settings → Integrations → Access tokens**.
The token is shown once. Send it in every request:

```
Authorization: Bearer oct_…
```

- A `read` token can call every `GET`. A `write` token can also log meals.
- A token sees only its owner's diary. It does not work on the app's own `/api/*` routes.
- 60 requests per minute per token; past that the answer is `429` with `Retry-After` (seconds).
- The administrator can turn tokens off for the whole installation; then every call is `403 integrations_disabled`.

## Errors

Errors are JSON with an HTTP status:

```json
{ "error": { "code": "period_too_long", "details": { "max": 31 } } }
```

| Status | Code                    | When                                                |
| ------ | ----------------------- | --------------------------------------------------- |
| 400    | `validation_failed`     | A bad parameter or body; `details` lists the fields |
| 400    | `period_too_long`       | `days` over 366 days or `meals` over 31 days        |
| 401    | `invalid_token`         | No token, or it is unknown, expired or revoked      |
| 403    | `insufficient_scope`    | A `read` token tried to write                       |
| 403    | `integrations_disabled` | The administrator turned tokens off                 |
| 429    | `rate_limited`          | Over 60 requests a minute                           |

## Units and days

- Amounts are metric, as stored: `grams` (millilitres for drinks, see `unit`), `kcal`, and grams of protein, fat and carbs (`proteinG`, `fatG`, `carbsG`). Numbers are not rounded. The user's display units are in `GET /profile`.
- Dates are `YYYY-MM-DD`. A meal belongs to the diary day it was logged on (`localDate`).
- "Today" is counted in the user's time zone, which the app reports from the user's devices.

## Reading

### `GET /api/v1/day?date=YYYY-MM-DD`

One day's totals, the same numbers as on the Today screen. `date` defaults to today.

```json
{
  "date": "2026-11-12",
  "eaten": { "kcal": 1430.5, "proteinG": 82, "fatG": 51.3, "carbsG": 160 },
  "norm": { "kcal": 2000, "proteinG": 150, "fatG": 67, "carbsG": 200 },
  "remaining": { "kcal": 569.5, "proteinG": 68, "fatG": 15.7, "carbsG": 40 }
}
```

`norm` and `remaining` are `null` when the user has no daily norm. A negative `remaining` is over the norm.

### `GET /api/v1/days?from=YYYY-MM-DD&to=YYYY-MM-DD`

Totals per day, up to 366 days, and today's norm.

```json
{
  "from": "2026-11-11",
  "to": "2026-11-12",
  "norm": { "kcal": 2000, "proteinG": 150, "fatG": 67, "carbsG": 200 },
  "days": [
    {
      "date": "2026-11-11",
      "eaten": { "kcal": 0, "proteinG": 0, "fatG": 0, "carbsG": 0 },
      "meals": 0
    },
    {
      "date": "2026-11-12",
      "eaten": { "kcal": 1430.5, "proteinG": 82, "fatG": 51.3, "carbsG": 160 },
      "meals": 3
    }
  ]
}
```

### `GET /api/v1/meals?from=YYYY-MM-DD&to=YYYY-MM-DD`

Meals with their dishes, up to 31 days. Photos are not included.

```json
{
  "from": "2026-11-12",
  "to": "2026-11-12",
  "meals": [
    {
      "clientId": "0b6f…",
      "eatenAt": "2026-11-12T09:00:00.000Z",
      "localDate": "2026-11-12",
      "mealType": "breakfast",
      "kcal": 410,
      "proteinG": 18,
      "fatG": 12,
      "carbsG": 55,
      "dishes": [
        {
          "name": "Oatmeal",
          "grams": 250,
          "unit": "g",
          "kcal": 410,
          "proteinG": 18,
          "fatG": 12,
          "carbsG": 55,
          "source": "manual"
        }
      ]
    }
  ]
}
```

`mealType` is one of `breakfast`, `lunch`, `dinner`, `snack`.

### `GET /api/v1/profile`

The profile, the manual norm if set, display units, language and today's norm. Never the email.

## Writing

### `POST /api/v1/meals` (write token)

```json
{
  "clientId": "6a1c2f0e-6a8e-4d39-9a53-0f3c1f1f2a10",
  "eatenAt": "2026-11-12T13:05:00Z",
  "mealType": "lunch",
  "dishes": [
    { "name": "Protein bar", "grams": 60, "kcal": 220, "proteinG": 20 }
  ]
}
```

- `dishes`: 1–50; `name` 1–80 characters, `grams` 0.1–5000, `kcal` 0–10000; `proteinG`, `fatG`, `carbsG` default to 0.
- `eatenAt` defaults to now and must not be in the future. The diary day and, without `mealType`, the meal type come from the user's time zone.
- `clientId` (a UUID) makes the call safe to retry: a repeat returns the saved meal with `200` and creates nothing. Without it every call is a new meal.
- Answers `201` with the meal in the `GET /meals` format.

## Example: Home Assistant

A sensor with the calories left for today, refreshed every 5 minutes. Put the token in `secrets.yaml`
as `oct_token: "Bearer oct_…"`.

```yaml
# configuration.yaml
rest:
  - resource: https://food.example.com/api/v1/day
    headers:
      Authorization: !secret oct_token
    scan_interval: 300
    sensor:
      - name: Calories left
        unique_id: oct_kcal_left
        value_template: '{{ value_json.remaining.kcal | round(0) if value_json.remaining else none }}'
        unit_of_measurement: kcal
      - name: Calories eaten
        unique_id: oct_kcal_eaten
        value_template: '{{ value_json.eaten.kcal | round(0) }}'
        unit_of_measurement: kcal
```

Logging a meal from a script with `curl`:

```sh
curl -X POST https://food.example.com/api/v1/meals \
  -H "Authorization: Bearer $OCT_TOKEN" -H "Content-Type: application/json" \
  -d '{"dishes":[{"name":"Coffee with milk","grams":250,"kcal":60,"proteinG":3,"fatG":3,"carbsG":5}]}'
```

## MCP

An AI assistant can read your diary through the Model Context Protocol. The server is at `/mcp`
on your installation (for example `https://food.example.com/mcp`). It only reads: nothing can be logged or changed through it.

- Turn it on in **Settings → Integrations → MCP**; it is off by default and answers `403 mcp_disabled` until then.
- Sign in with a personal access token, `read` is enough: `Authorization: Bearer oct_…`. The token limits and the administrator's switch apply as above.
- Transport: Streamable HTTP without sessions. `POST /mcp` takes one JSON-RPC 2.0 message or a batch and answers with `application/json`; notifications get `202` with no body. There is no stream: `GET /mcp` answers `405`.
- Protocol versions `2025-06-18` and `2025-03-26`.
- A request from a browser with an `Origin` other than the installation's `PUBLIC_URL` is refused with `403`.

Tools:

| Tool          | Arguments                     | Returns                                                                                                                                  |
| ------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `get_day`     | `date` (optional, YYYY-MM-DD) | The same as `GET /day`                                                                                                                   |
| `get_days`    | `from`, `to`                  | The same as `GET /days`, up to 366 days                                                                                                  |
| `list_meals`  | `from`, `to`                  | The same as `GET /meals`; see below                                                                                                      |
| `get_profile` | none                          | As `GET /profile`, with `height`, `weight` and `targetWeight` in the user's units (`heightUnit` `cm` or `in`, `weightUnit` `kg` or `lb`) |

Food amounts are metric, as in the API. `list_meals` gives at most 31 days from `from` and 200 meals; a longer
answer is cut and has `truncated: true`, so ask again for a shorter period. A bad argument or a too long `get_days`
period comes back as a tool result with `isError: true` and the error in the text.

**Settings → Integrations → MCP** creates a read token and shows the configuration to paste. For an
assistant that speaks HTTP itself, such as Cursor (**Settings → MCP → Add new server**):

```json
{
  "mcpServers": {
    "oct": {
      "url": "https://food.example.com/mcp",
      "headers": {
        "Authorization": "Bearer oct_…"
      }
    }
  }
}
```

Claude Desktop (**Settings → Developer → Edit Config**, then restart) reaches it through `mcp-remote`, which needs Node.js:

```json
{
  "mcpServers": {
    "oct": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://food.example.com/mcp",
        "--header",
        "Authorization: Bearer oct_…"
      ]
    }
  }
}
```
