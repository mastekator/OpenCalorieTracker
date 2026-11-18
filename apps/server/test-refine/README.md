# Refine prompt cases

`pnpm --filter @oct/server check-refine` runs these cases through `refineMeal` (Recognize again / Refine, ADR-0020) with the provider from env and prints a table: case, expected, got, kcal, asked, result, ms. Run it by hand after a change to the refine or questions prompt; CI does not call a model.

```sh
AI_PROVIDER=google AI_MODEL=gemini-3.8-flash AI_API_KEY=... pnpm --filter @oct/server check-refine
```

`cases.json` is an array of cases:

| Field    | Meaning                                                                                                         |
| -------- | --------------------------------------------------------------------------------------------------------------- |
| `name`   | Case name for the table.                                                                                        |
| `mode`   | `again` (Recognize again) or `refine`.                                                                          |
| `photo`  | Optional: a file from [`../test-photos`](../test-photos/README.md). Without it the text is the only input.      |
| `text`   | The user's note; required for `refine`.                                                                         |
| `locale` | Language of the dish names, `en` by default.                                                                    |
| `dishes` | The current list, as the client sends it: `id`, `name`, `grams`, `kcal`, `proteinG`, `fatG`, `carbsG`, `fixed`. |
| `expect` | What the answer must have; every part is optional.                                                              |

`expect`:

- `dishes`: `[{ "name": "rice", "grams": [195, 205], "kcal": [240, 280] }]`: for each entry some dish matches the name (a case-insensitive regular expression) and both ranges.
- `absent`: name patterns no dish may match.
- `kept`: ids of input dishes that must come back (by `ref`) with the same grams and kcal (±1).
- `question`: a name pattern; the AI must ask about a dish that matches it.

A miss on `question` counts as a failed case, but it is a signal rather than a bug: questions are not deterministic, so look at a few runs before changing the prompt.
