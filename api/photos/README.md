# Test photos

The model test set: **Settings → AI provider → Test model** and `pnpm --filter @oct/server check-model` run these photos (ADR-0007, ADR-0019). The photos and `expected.json` are copied into the Docker image; CI does not call a model with them.

`expected.json` (ADR-0033) has the test set version `set` and, per photo:

- `dishes`: every dish in the photo. `words` are English names and transliterations of the dish, not its ingredients; a dish is recognized when a returned name has one of them from the start of a word, any case, no diacritics («eggs» is egg, «eggplant» is not). The first word labels the dish in the results. `count`, only where the items are plainly countable: the entries of that dish must add up to it (a number in the name counts, «3 eggs»). Each returned entry goes to the first dish it names; extra entries fail nothing.
- `ref`: kcal of the portion in the photo. The range is computed: ±20% for `"level": "exact"`, ±30% for `"level": "notExact"`.
- `per100`, instead of `ref`, for a pack whose weight is not visible: the label kcal per 100 g, widened by ±10%; every matched entry's kcal ÷ grams × 100 must fit.
- `level`: `exact` for countable single items (every dish must come back `exact`), `notExact` for mixed dishes (none may).
- `"empty": true`: not food; the dish list must be empty.

A photo fails with every reason at once. **Bump `set` on any change of photos, words or `ref`**: runs of different sets are not comparable.

Reference portions (`ref`, grams × kcal per 100 g):

| File                 | Estimate                                                                 | ref  | Range              |
| -------------------- | ------------------------------------------------------------------------ | ---- | ------------------ |
| banana.jpg           | 1 medium banana, ~120 g                                                  | 105  | 84–126             |
| eggs.jpg             | 3 eggs × ~72 kcal                                                        | 215  | 172–258            |
| bread-slice.jpg      | rye bread slice, ~38 g                                                   | 90   | 72–108             |
| pilaf.jpg            | pilaf with beef ~300 g × ~180 + 2 pieces of flatbread ~110               | 650  | 455–845            |
| salad.jpg            | tuna ~100 g, spinach, tomatoes, dressing ~1.5 tbsp                       | 300  | 210–390            |
| spaghetti.jpg        | pasta ~200 g, sauce ~120 g, parmesan ~15 g                               | 450  | 315–585            |
| borscht.jpg          | ~350 ml + sour cream ~15 g                                               | 180  | 126–234            |
| noodles.jpg          | fried noodles ~250 g × ~170, fried egg 90, krupuk 40, sambal 20, acar 15 | 590  | 413–767            |
| sushi.jpg            | 6 nigiri × ~50                                                           | 300  | 240–360            |
| sausages.jpg         | pack weight not visible: label 191–287 kcal/100 g (`per100`)             | —    | 172–316 kcal/100 g |
| fried-eggs-toast.jpg | 3 fried eggs × ~90, toast 90, peanut butter ~15 g 90                     | 450  | 315–585            |
| cheesecake.jpg       | ~160 g × ~280                                                            | 450  | 315–585            |
| grilled-shrimp.jpg   | ~300 g × ~115                                                            | 350  | 245–455            |
| crepes-salad.jpg     | 6 folded crepe pieces with salmon × ~130, salad 80                       | 860  | 602–1118           |
| pastries.jpg         | 3 curd danishes × ~330, 3 small croissants × ~100                        | 1290 | 903–1677           |

Sushi is `exact`, and the level is checked on every returned dish, extras included: wasabi or ginger returned below `exact` fails the photo, an honest fail.

Photos are downscaled to 800 px and recompressed, with no EXIF or XMP (a test checks every file). All are CC0 or public domain. The photos of the project owner are cropped to the food (no hands, other dishes or jars where possible):

| File                 | Source                                                                                                                                                                                                                                                              | Author                              | License       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------- |
| banana.jpg           | [File:Banana on white background.jpg](https://commons.wikimedia.org/wiki/File:Banana_on_white_background.jpg)                                                                                                                                                       | Paolo Neo                           | Public domain |
| eggs.jpg             | [File:Three chicken eggs.jpg](https://commons.wikimedia.org/wiki/File:Three_chicken_eggs.jpg)                                                                                                                                                                       | www.Pixel.la Free Stock Photos      | CC0           |
| bread-slice.jpg      | [File:Slice of rye bread Roggenbengel 2025-02-14 01.jpg](https://commons.wikimedia.org/wiki/File:Slice_of_rye_bread_Roggenbengel_2025-02-14_01.jpg)                                                                                                                 | Leonhard Lenz                       | CC0           |
| salad.jpg            | [File:Salad of mixed greens, tuna fish, and grape tomatoes, … - Massachusetts.jpg](https://commons.wikimedia.org/wiki/File:Salad_of_mixed_greens,_tuna_fish,_and_grape_tomatoes,_with_mustard_and_garlic_olive_oil_dressing,_plus_black_pepper_-_Massachusetts.jpg) | Daderot                             | CC0           |
| spaghetti.jpg        | [File:Spaghetti-prepared.jpg](https://commons.wikimedia.org/wiki/File:Spaghetti-prepared.jpg)                                                                                                                                                                       | unknown                             | Public domain |
| borscht.jpg          | [File:Belorussian borscht - 2015 AD.JPG](https://commons.wikimedia.org/wiki/File:Belorussian_borscht_-_2015_AD.JPG)                                                                                                                                                 | Pracar                              | CC0           |
| pilaf.jpg            | [File:Palow at Expo2025 Turkmenistan Pavilion.jpg](https://commons.wikimedia.org/wiki/File:Palow_at_Expo2025_Turkmenistan_Pavilion.jpg), cropped to the plate                                                                                                       | 妖精書士                            | CC0           |
| chair.jpg            | [File:Desk chair.jpg](https://commons.wikimedia.org/wiki/File:Desk_chair.jpg)                                                                                                                                                                                       | Emiellaiendiay at English Wikipedia | Public domain |
| noodles.jpg          | Photo of the project owner                                                                                                                                                                                                                                          | project owner                       | CC0           |
| sushi.jpg            | Photo of the project owner                                                                                                                                                                                                                                          | project owner                       | CC0           |
| sausages.jpg         | Photo of the project owner                                                                                                                                                                                                                                          | project owner                       | CC0           |
| fried-eggs-toast.jpg | Photo of the project owner                                                                                                                                                                                                                                          | project owner                       | CC0           |
| cheesecake.jpg       | Photo of the project owner                                                                                                                                                                                                                                          | project owner                       | CC0           |
| grilled-shrimp.jpg   | Photo of the project owner                                                                                                                                                                                                                                          | project owner                       | CC0           |
| crepes-salad.jpg     | Photo of the project owner                                                                                                                                                                                                                                          | project owner                       | CC0           |
| pastries.jpg         | Photo of the project owner                                                                                                                                                                                                                                          | project owner                       | CC0           |
