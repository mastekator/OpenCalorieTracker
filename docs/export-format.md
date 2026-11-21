# Export format

OpenCalorieTracker exports the diary as JSON (`oct-export`) or as CSV files. Import reads the same JSON, so a file moves a diary between servers without loss. The schema lives in `packages/shared/src/export/schema.ts` (`octExportSchema`).

## Files

| Export           | You get                                                                               |
| ---------------- | ------------------------------------------------------------------------------------- |
| JSON, no photos  | `oct-export-YYYY-MM-DD.json`                                                          |
| JSON with photos | `oct-export-YYYY-MM-DD.zip`: `oct-export.json` and `photos/`                          |
| CSV              | `oct-export-YYYY-MM-DD.zip`: `meals.csv`, `weighings.csv` and, with photos, `photos/` |

The ZIP is stored without compression: photos are JPEG already.

## JSON

```json
{
  "format": "oct-export",
  "version": 1,
  "exportedAt": "2026-11-21T10:00:00.000Z",
  "app": "0.4.0",
  "period": { "from": "2026-11-01", "to": "2026-11-21" },
  "profile": {
    "sex": "female",
    "birthDate": "1990-05-01",
    "heightCm": 168,
    "weightKg": 62.5,
    "activity": "light",
    "goal": "maintain",
    "targetWeightKg": null,
    "deadline": null
  },
  "norm": { "kcal": 2000, "proteinPct": 20, "fatPct": 30, "carbsPct": 50 },
  "settings": {
    "locale": "en",
    "theme": "system",
    "units": "metric",
    "offEnabled": false
  },
  "meals": [
    {
      "clientId": "0b9e5a52-2f7e-4c1e-9d55-4a8a3b0f6a10",
      "localDate": "2026-11-20",
      "eatenAt": "2026-11-20T08:15:00.000Z",
      "tzOffsetMin": 180,
      "mealType": "breakfast",
      "photo": "photos/42.jpg",
      "dishes": [
        {
          "name": "Oatmeal",
          "grams": 183.4,
          "unit": "g",
          "kcal": 250.37,
          "proteinG": 8.1,
          "fatG": 4.4,
          "carbsG": 44.12,
          "source": "ai",
          "illustration": "oatmeal"
        }
      ]
    }
  ],
  "weighings": [{ "date": "2026-11-20", "weightKg": 62.4 }]
}
```

### Root

| Key          | Type                     | Notes                                                                                                                        |
| ------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `format`     | `"oct-export"`           | Always this value.                                                                                                           |
| `version`    | integer                  | Format version, see [Versions](#versions).                                                                                   |
| `exportedAt` | ISO 8601 date-time       | When the file was written.                                                                                                   |
| `app`        | string                   | App version that wrote the file.                                                                                             |
| `period`     | `{ from, to }` or `null` | Dates `YYYY-MM-DD`, inclusive. `null`: the whole diary.                                                                      |
| `profile`    | object                   | Sex, birth date, height (cm), weight (kg), activity, goal, target weight, deadline. Any field may be `null`. No email.       |
| `norm`       | object or `null`         | The manual daily goal: kcal and protein, fat, carbs as percent of kcal. `null` when the goal is calculated from the profile. |
| `settings`   | object                   | `locale`, `theme` (`system`, `light`, `dark`), `units` (`metric`, `us`), `offEnabled` (barcode lookup).                      |
| `meals`      | array                    | See below.                                                                                                                   |
| `weighings`  | array                    | `{ date, weightKg }`, one per day.                                                                                           |

### Meal

| Key           | Type               | Notes                                                                                         |
| ------------- | ------------------ | --------------------------------------------------------------------------------------------- |
| `clientId`    | string             | Stable id of the meal.                                                                        |
| `localDate`   | `YYYY-MM-DD`       | The diary day.                                                                                |
| `eatenAt`     | ISO 8601 date-time | When it was eaten.                                                                            |
| `tzOffsetMin` | integer            | Minutes east of UTC on the device: local time = `eatenAt` + `tzOffsetMin`.                    |
| `mealType`    | string             | `breakfast`, `lunch`, `dinner`, `snack`.                                                      |
| `photo`       | string, optional   | `photos/<id>.jpg` inside the ZIP. Only when photos were exported and the photo is still kept. |
| `dishes`      | array              | At least one dish.                                                                            |

### Dish

| Key                                  | Type             | Notes                                                                                          |
| ------------------------------------ | ---------------- | ---------------------------------------------------------------------------------------------- |
| `name`                               | string           |                                                                                                |
| `grams`                              | number           | Amount in `unit`. `0` for a meal total without dishes.                                         |
| `unit`                               | `"g"` or `"ml"`  |                                                                                                |
| `kcal`, `proteinG`, `fatG`, `carbsG` | number           | For the whole amount, not per 100 g.                                                           |
| `source`                             | string           | Where the values came from: `ai`, `manual`, `history`, `recipe`, `barcode`, `label`, `import`. |
| `illustration`                       | string, optional | Illustration chosen by hand.                                                                   |

Numbers are written as stored, without rounding.

## CSV

UTF-8 with BOM, comma separator, dot as the decimal mark, quoting by RFC 4180. Headers are in English and do not change with the app language.

`meals.csv`, one row per dish:

```csv
date,time,meal,name,grams,unit,kcal,protein_g,fat_g,carbs_g,source,photo
2026-11-20,11:15,breakfast,Oatmeal,183.4,g,250.37,8.1,4.4,44.12,ai,photos/42.jpg
2026-11-20,11:15,breakfast,Milk,200,ml,104,6,5,9.4,barcode,photos/42.jpg
```

`date` and `time` are local to the device that logged the meal. `unit` says whether `grams` is grams or millilitres.

`weighings.csv`:

```csv
date,weight_kg
2026-11-20,62.4
```

## Versions

`version` grows only with an incompatible change. New data (water, supplements and other modules) arrives as new optional keys or new CSV files and keeps the version. Import accepts files with `version` up to the current one, ignores keys it does not know, and rejects a newer version.
