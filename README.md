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

## How the daily goal is calculated

The app explains your own numbers step by step under **Profile → How it’s calculated**. This is the general formula behind it (`packages/shared/src/norm/calculate.ts`). In US units, height and weight are converted to cm and kg first.

1. **Energy at rest** (basal metabolic rate, Mifflin–St Jeor), age in full years:
   - men: `10 × weight (kg) + 6.25 × height (cm) − 5 × age + 5`
   - women: `10 × weight (kg) + 6.25 × height (cm) − 5 × age − 161`
2. **A typical day** (total daily energy expenditure) = energy at rest × activity factor:

   | Activity  | Typical day                              | Factor |
   | --------- | ---------------------------------------- | ------ |
   | Minimal   | desk job, almost no exercise             | 1.2    |
   | Light     | light workouts or walks 1–3 times a week | 1.375  |
   | Moderate  | workouts 3–5 times a week                | 1.55   |
   | High      | hard workouts 6–7 times a week           | 1.725  |
   | Very high | physical labour or 2 workouts a day      | 1.9    |

3. **Goal.** Maintain: no change. Lose or gain: the pace is the target weight over the weeks to the chosen date, or by default 0.5% of body weight a week to lose and 0.25% to gain. The daily change is `pace (kg/week) × 7,700 / 7` kcal (1 kg of body fat ≈ 7,700 kcal). The pace is flagged, never blocked: losing over 1% of body weight a week is fast, over 1.5% may harm health, gaining over 0.5% adds mostly fat.
4. **Safe minimum** (only when losing): the goal never goes below 1,200 kcal for women and 1,500 kcal for men. If the typical day is already below that, the goal is the typical day with no deficit.
5. **Rounding:** the goal is rounded to 10 kcal; macros are counted from the rounded goal.
6. **Macros:** protein 1.6 g per kg of body weight, kept within 10–35% of kcal; fat 30% of kcal; carbs the rest. 4 kcal per gram of protein and carbs, 9 per gram of fat; each rounded to a whole gram.

A goal set manually replaces the calculation. Real energy use differs between people by about 10%, so update your weight every 1–2 weeks and adjust the goal if your weight doesn’t change as expected.

**Sources**

- Mifflin M. D., St Jeor S. T. et al. A new predictive equation for resting energy expenditure in healthy individuals. _Am J Clin Nutr._ 1990;51(2):241–247. [doi:10.1093/ajcn/51.2.241](https://doi.org/10.1093/ajcn/51.2.241)
- Frankenfield D. et al. Comparison of predictive equations for resting metabolic rate in healthy nonobese and obese adults: a systematic review. _J Am Diet Assoc._ 2005;105(5):775–789. [doi:10.1016/j.jada.2005.02.005](https://doi.org/10.1016/j.jada.2005.02.005)
- FAO/WHO/UNU. [_Human energy requirements._](https://www.fao.org/4/y5686e/y5686e00.htm) 2004 (physical activity levels).
- McArdle W. D., Katch F. I., Katch V. L. _Exercise Physiology_ (activity factor scale).
- Hall K. D. et al. Quantification of the effect of energy imbalance on bodyweight. _Lancet._ 2011;378(9793):826–837. [doi:10.1016/S0140-6736(11)60812-X](<https://doi.org/10.1016/S0140-6736(11)60812-X>)
- Helms E. R. et al. Evidence-based recommendations for natural bodybuilding contest preparation: nutrition and supplementation. _JISSN._ 2014;11:20. [doi:10.1186/1550-2783-11-20](https://doi.org/10.1186/1550-2783-11-20)
- Roberts B. M., Helms E. R. et al. Nutritional recommendations for physique athletes. _J Hum Kinet._ 2020;71:79–108. [doi:10.2478/hukin-2019-0096](https://doi.org/10.2478/hukin-2019-0096)
- Turocy P. S. et al. NATA position statement: safe weight loss and maintenance practices in sport and exercise. _J Athl Train._ 2011;46(3):322–336. [doi:10.4085/1062-6050-46.3.322](https://doi.org/10.4085/1062-6050-46.3.322)
- Iraki J. et al. Nutrition recommendations for bodybuilders in the off-season. _Sports._ 2019;7(7):154. [doi:10.3390/sports7070154](https://doi.org/10.3390/sports7070154)
- NIH/NHLBI. [_Clinical Guidelines on the Identification, Evaluation, and Treatment of Overweight and Obesity in Adults._](https://www.nhlbi.nih.gov/files/docs/guidelines/ob_gdlns.pdf) 1998.
- Morton R. W. et al. A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training-induced gains in muscle mass and strength. _Br J Sports Med._ 2018;52(6):376–384. [doi:10.1136/bjsports-2017-097608](https://doi.org/10.1136/bjsports-2017-097608)
- Jäger R. et al. ISSN Position Stand: protein and exercise. _JISSN._ 2017;14:20. [doi:10.1186/s12970-017-0177-8](https://doi.org/10.1186/s12970-017-0177-8)
- Institute of Medicine. _Dietary Reference Intakes for Energy, Carbohydrate, Fiber, Fat, Fatty Acids, Cholesterol, Protein, and Amino Acids._ 2005 (AMDR). [doi:10.17226/10490](https://doi.org/10.17226/10490)
- WHO. [_Healthy diet._](https://www.who.int/news-room/fact-sheets/detail/healthy-diet) Fact sheet.
- WHO. [Body mass index](https://www.who.int/data/gho/data/themes/topics/topic-details/GHO/body-mass-index) (BMI under 18.5 is underweight).

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
