# Test photos

A small manual set for `pnpm --filter @oct/server check-model` (ADR-0007). Not used by CI and not copied into the Docker image.

`expected.json` lists, per photo, the dishes we expect (for reading only), a rough kcal range for the whole photo and the expected confidence:

- `"level": "exact"`: countable single items; every dish must come back as `exact`.
- `"level": "notExact"`: mixed dishes; no dish may come back as `exact`.
- `"empty": true`: not food; the dish list must be empty.

Photos are downscaled to 800 px and recompressed. All are CC0 or public domain:

| File               | Source                                                                                                                                                                                                                                                              | Author                              | License       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------- |
| banana.jpg         | [File:Banana on white background.jpg](https://commons.wikimedia.org/wiki/File:Banana_on_white_background.jpg)                                                                                                                                                       | Paolo Neo                           | Public domain |
| eggs.jpg           | [File:Three chicken eggs.jpg](https://commons.wikimedia.org/wiki/File:Three_chicken_eggs.jpg)                                                                                                                                                                       | www.Pixel.la Free Stock Photos      | CC0           |
| bread-slice.jpg    | [File:Slice of rye bread Roggenbengel 2025-02-14 01.jpg](https://commons.wikimedia.org/wiki/File:Slice_of_rye_bread_Roggenbengel_2025-02-14_01.jpg)                                                                                                                 | Leonhard Lenz                       | CC0           |
| plov.jpg           | [File:Farg'onacha osh.jpg](https://commons.wikimedia.org/wiki/File:Farg%27onacha_osh.jpg)                                                                                                                                                                           | UzbekistanWikiEditor                | CC0           |
| salad.jpg          | [File:Salad of mixed greens, tuna fish, and grape tomatoes, … - Massachusetts.jpg](https://commons.wikimedia.org/wiki/File:Salad_of_mixed_greens,_tuna_fish,_and_grape_tomatoes,_with_mustard_and_garlic_olive_oil_dressing,_plus_black_pepper_-_Massachusetts.jpg) | Daderot                             | CC0           |
| spaghetti.jpg      | [File:Spaghetti-prepared.jpg](https://commons.wikimedia.org/wiki/File:Spaghetti-prepared.jpg)                                                                                                                                                                       | unknown                             | Public domain |
| borscht.jpg        | [File:Belorussian borscht - 2015 AD.JPG](https://commons.wikimedia.org/wiki/File:Belorussian_borscht_-_2015_AD.JPG)                                                                                                                                                 | Pracar                              | CC0           |
| pilaf-and-meat.jpg | [File:Afghan Zamarod Palaw (Emerald Pilaf) … with a side of Meat in Sour Cherry Sauce.jpg](<https://commons.wikimedia.org/wiki/File:Afghan_Zamarod_Palaw_(Emerald_Pilaf)_%D8%B2%D9%85%D8%B1%D8%AF_%D9%BE%D9%84%D9%88_with_a_side_of_Meat_in_Sour_Cherry_Sauce.jpg>) | Zimistani                           | CC0           |
| chair.jpg          | [File:Desk chair.jpg](https://commons.wikimedia.org/wiki/File:Desk_chair.jpg)                                                                                                                                                                                       | Emiellaiendiay at English Wikipedia | Public domain |
