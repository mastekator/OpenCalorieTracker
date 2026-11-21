import { round1 } from '../units.js';

/**
 * Edible share of foods sold with inedible parts (ADR-0039 §1): `edible` = 100 − refuse %, whole
 * percent. Source: USDA SR Legacy (SR28, FOOD_DES.Refuse; public domain), NDB number per row.
 * Extend with a PR; keys are what the AI returns as `edibleRef`.
 */
export const REFUSE = [
  // Fruits: peel, core, pits, seeds.
  { key: 'apple', edible: 90 }, // 09003
  { key: 'apricot', edible: 93 }, // 09021
  { key: 'avocado', edible: 74 }, // 09037
  { key: 'banana', edible: 64 }, // 09040
  { key: 'cantaloupe', edible: 51 }, // 09181
  { key: 'cherimoya', edible: 69 }, // 09062
  { key: 'cherry', edible: 92 }, // 09070
  { key: 'sour_cherry', edible: 90 }, // 09063
  { key: 'clementine', edible: 77 }, // 09433
  { key: 'date', edible: 92 }, // 09421
  { key: 'durian', edible: 32 }, // 09422
  { key: 'feijoa', edible: 57 }, // 09334
  { key: 'grapefruit', edible: 51 }, // 09112
  { key: 'grape', edible: 96 }, // 09132
  { key: 'guava', edible: 78 }, // 09139
  { key: 'honeydew', edible: 46 }, // 09184
  { key: 'jackfruit', edible: 28 }, // 09144
  { key: 'kiwi', edible: 76 }, // 09148
  { key: 'lemon', edible: 53 }, // 09150
  { key: 'lime', edible: 84 }, // 09159
  { key: 'longan', edible: 53 }, // 09172
  { key: 'lychee', edible: 60 }, // 09164
  { key: 'mandarin', edible: 74 }, // 09218
  { key: 'mango', edible: 71 }, // 09176
  { key: 'nectarine', edible: 91 }, // 09191
  { key: 'orange', edible: 73 }, // 09200
  { key: 'papaya', edible: 62 }, // 09226
  { key: 'passion_fruit', edible: 52 }, // 09231
  { key: 'peach', edible: 96 }, // 09236
  { key: 'pear', edible: 90 }, // 09252
  { key: 'persimmon', edible: 84 }, // 09263
  { key: 'pineapple', edible: 51 }, // 09266
  { key: 'plum', edible: 94 }, // 09279
  { key: 'pomegranate', edible: 56 }, // 09286
  { key: 'pomelo', edible: 56 }, // 09295
  { key: 'prickly_pear', edible: 75 }, // 09287
  { key: 'quince', edible: 61 }, // 09296
  { key: 'sapodilla', edible: 80 }, // 09313
  { key: 'strawberry', edible: 94 }, // 09316
  { key: 'tamarind', edible: 34 }, // 09322
  { key: 'watermelon', edible: 52 }, // 09326
  { key: 'coconut', edible: 52 }, // 12104
  // Nuts and seeds in shell.
  { key: 'almond_in_shell', edible: 40 }, // 12061
  { key: 'brazil_nut_in_shell', edible: 51 }, // 12078
  { key: 'chestnut_in_shell', edible: 74 }, // 12097
  { key: 'hazelnut_in_shell', edible: 41 }, // 12120
  { key: 'macadamia_in_shell', edible: 31 }, // 12131
  { key: 'pecan_in_shell', edible: 53 }, // 12142
  { key: 'pine_nut_in_shell', edible: 77 }, // 12147
  { key: 'pistachio_in_shell', edible: 53 }, // 12151
  { key: 'pumpkin_seed_in_shell', edible: 74 }, // 12014
  { key: 'sunflower_seed_in_shell', edible: 54 }, // 12036
  { key: 'walnut_in_shell', edible: 45 }, // 12155
  // Poultry, fish and meat on the bone, raw.
  { key: 'chicken_whole', edible: 68 }, // 05006
  { key: 'chicken_breast_bone_in', edible: 80 }, // 05057
  // SR28 lists the 33% bone twice (66%); one share is used.
  { key: 'chicken_drumstick', edible: 67 }, // 05066
  { key: 'chicken_leg', edible: 73 }, // 05075
  { key: 'chicken_wing', edible: 62 }, // 05100
  { key: 'duck_whole', edible: 72 }, // 05139
  { key: 'goose_whole', edible: 81 }, // 05146
  { key: 'turkey_whole', edible: 71 }, // 05165
  { key: 'turkey_drumstick', edible: 67 }, // 05736
  { key: 'trout_whole', edible: 47 }, // 15274
  { key: 'pork_chop_bone_in', edible: 75 }, // 10036
  { key: 'pork_spareribs', edible: 70 }, // 10088
  { key: 'pork_leg_bone_in', edible: 83 }, // 10008
  { key: 'lamb_chop', edible: 79 }, // 17023
  { key: 'lamb_rib', edible: 73 }, // 17029
  { key: 'lamb_shoulder_bone_in', edible: 79 }, // 17035
  { key: 't_bone_steak', edible: 78 }, // 13473
  // Shellfish, corn, eggs.
  { key: 'shrimp_in_shell', edible: 87 }, // 15270
  // Husked ear: 11167 refuse is 35% husk and silk + 29% cob; edible = 36 / 65 of the husked ear.
  { key: 'corn_on_cob', edible: 55 }, // 11167
  { key: 'egg', edible: 88 }, // 01123
  { key: 'quail_egg', edible: 92 }, // 01140
] as const;

export type EdibleKey = (typeof REFUSE)[number]['key'];

/** Reference keys for the prompt, one line (ADR-0039 §2). */
export const EDIBLE_KEYS = REFUSE.map((r) => r.key).join(', ');

const byKey = new Map<string, number>(REFUSE.map((r) => [r.key, r.edible]));

/** Edible percent for a reference key, or undefined for an unknown key. */
export const edibleOf = (key: string) => byKey.get(key);

/** Edible grams of a gross weight, one decimal like `oneDecimal`. Rescale the dish with `scaleItem`. */
export const edibleGrams = (grossG: number, pct: number) =>
  round1((grossG * pct) / 100);
