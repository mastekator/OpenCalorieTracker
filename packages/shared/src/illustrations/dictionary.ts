import { z } from 'zod';

// Dish illustrations (ADR-0009, design OCT-55): categories, captions, RU+EN keyword stems and the matcher.
// Ported from docs/design/oct-33/dictionary.js; the EXAMPLES there are the unit test.
//
// WORDS: comma-separated stems. Rules: lower case, ё→е, non-letters → spaces. A stem matches the START of a word ("банан" ⊂ «бананом»).
// "stem$" = whole word only. A stem may span words ("картофель фри", "hot dog"): then all words but the last are written in full.
// Winner (AC-3.4): a dish-type category beats an ingredient → then the earlier word → then the longer stem
// (so «сырник» beats «сыр», "eggplant" beats "egg"). Nothing found → "plate" (AC-3.5).

// Category order = picker grid order. type: true = dish type (AC-3.4). items[0] = category default.
export const CATEGORIES = [
  { id: 'fruit', ru: 'Фрукты', en: 'Fruit', items: ['fruit', 'fruit-banana'] },
  {
    id: 'vegetables',
    ru: 'Овощи',
    en: 'Vegetables',
    items: ['vegetables', 'vegetables-broccoli'],
  },
  { id: 'meat', ru: 'Мясо', en: 'Meat', items: ['meat', 'meat-sausage'] },
  {
    id: 'poultry',
    ru: 'Птица',
    en: 'Poultry',
    items: ['poultry', 'poultry-breast'],
  },
  { id: 'fish', ru: 'Рыба', en: 'Fish', items: ['fish', 'fish-sushi'] },
  { id: 'eggs', ru: 'Яйца', en: 'Eggs', items: ['eggs', 'eggs-boiled'] },
  {
    id: 'grains',
    ru: 'Крупы и гарниры',
    en: 'Grains & sides',
    items: ['grains', 'grains-porridge', 'grains-potato'],
  },
  {
    id: 'bread',
    ru: 'Хлеб и выпечка',
    en: 'Bread & pastry',
    items: ['bread', 'bread-croissant'],
  },
  {
    id: 'dairy',
    ru: 'Молочное',
    en: 'Dairy',
    items: ['dairy', 'dairy-yogurt'],
  },
  { id: 'cheese', ru: 'Сыр', en: 'Cheese', items: ['cheese'] },
  {
    id: 'soup',
    ru: 'Супы',
    en: 'Soups',
    type: true,
    items: ['soup', 'soup-borscht'],
  },
  {
    id: 'salad',
    ru: 'Салаты',
    en: 'Salads',
    type: true,
    items: ['salad', 'salad-tomato'],
  },
  {
    id: 'pasta',
    ru: 'Паста',
    en: 'Pasta',
    type: true,
    items: ['pasta', 'pasta-dumplings'],
  },
  { id: 'pizza', ru: 'Пицца', en: 'Pizza', type: true, items: ['pizza'] },
  {
    id: 'fastfood',
    ru: 'Бургеры и фастфуд',
    en: 'Burgers & fast food',
    type: true,
    items: ['fastfood', 'fastfood-fries', 'fastfood-roll'],
  },
  {
    id: 'sweets',
    ru: 'Сладкое',
    en: 'Sweets',
    type: true,
    items: ['sweets', 'sweets-chocolate', 'sweets-icecream', 'sweets-pancakes'],
  },
  {
    id: 'drinks',
    ru: 'Напитки',
    en: 'Drinks',
    type: true,
    items: ['drinks', 'drinks-water', 'drinks-wine'],
  },
  {
    id: 'coffee',
    ru: 'Кофе и чай',
    en: 'Coffee & tea',
    type: true,
    items: ['coffee', 'coffee-tea'],
  },
  { id: 'nuts', ru: 'Орехи', en: 'Nuts', items: ['nuts'] },
  { id: 'sauces', ru: 'Соусы', en: 'Sauces', items: ['sauces'] },
  { id: 'plate', ru: 'Тарелка', en: 'Plate', items: ['plate'] },
] as const;

// Caption in the picker for non-default items (defaults use the category name). [ru, en]
export const NAMES: Partial<
  Record<IllustrationId, readonly [ru: string, en: string]>
> = {
  'fruit-banana': ['Банан', 'Banana'],
  'vegetables-broccoli': ['Брокколи', 'Broccoli'],
  'meat-sausage': ['Колбаса', 'Sausage'],
  'poultry-breast': ['Грудка', 'Breast'],
  'fish-sushi': ['Суши', 'Sushi'],
  'eggs-boiled': ['Варёные', 'Boiled'],
  'grains-porridge': ['Каша', 'Porridge'],
  'grains-potato': ['Картофель', 'Potatoes'],
  'bread-croissant': ['Круассан', 'Croissant'],
  'dairy-yogurt': ['Йогурт, творог', 'Yogurt'],
  'soup-borscht': ['Борщ', 'Borscht'],
  'salad-tomato': ['Овощной', 'Veggie salad'],
  'pasta-dumplings': ['Пельмени', 'Dumplings'],
  'fastfood-fries': ['Картофель фри', 'Fries'],
  'fastfood-roll': ['Шаурма', 'Wrap'],
  'sweets-chocolate': ['Шоколад', 'Chocolate'],
  'sweets-icecream': ['Мороженое', 'Ice cream'],
  'sweets-pancakes': ['Блины, сырники', 'Pancakes'],
  'drinks-water': ['Вода', 'Water'],
  'drinks-wine': ['Вино, пиво', 'Wine & beer'],
  'coffee-tea': ['Чай', 'Tea'],
};

export const WORDS: Partial<Record<IllustrationId, string>> = {
  fruit:
    'яблок, груш, апельсин, мандарин, персик, абрикос, слива$, сливы$, виноград, ягод, клубник, малин, черник, голубик, вишн, черешн, арбуз, дын, киви$, ананас, манго$, гранат, хурм, фрукт, apple, pear, orange, tangerine, mandarin, peach, apricot, plum, grape, berr, strawberr, raspberr, blueberr, cherr, watermelon, melon, kiwi, pineapple, mango, pomegranate, persimmon, fruit',
  'fruit-banana': 'банан, banana',
  vegetables:
    'овощ, помидор, томат, огур, перец, перц, капуст, морков, свекл, свекол, кабач, баклажан, лук$, чеснок, редис, тыкв, кукуруз, фасол, шпинат, авокадо, зелень, vegetable, veggie, tomato, cucumber, pepper, cabbage, carrot, beet, zucchini, eggplant, aubergine, onion, garlic, radish, pumpkin, corn$, spinach, avocado, beans',
  'vegetables-broccoli':
    'брокколи, цветная капуст, брюссел, спарж, broccoli, cauliflower, asparagus, sprouts',
  meat: 'мяс, говяд, говяж, свинин, свин, баранин, телятин, стейк, котлет, фарш, шашлык, гуляш, бефстроган, ростбиф, тефтел, фрикадел, печень$, печени$, печенк, ребр, пастрам, beef, pork, lamb, veal, steak, meat, mince, kebab, meatball, ribs$, liver',
  'meat-sausage':
    'колбас, сосис, сардельк, бекон, ветчин, салями, пепперони, salami, sausage, bacon, ham$, pepperoni',
  poultry:
    'куриц, курин, кура$, куры$, курочк, цыпл, индейк, индюш, утк, утин, гус, наггет, chicken, turkey, duck, wing, nugget',
  'poultry-breast':
    'грудк, куриное филе, куриная грудк, chicken breast, breast$',
  fish: 'рыб, лосос, семг, форел, тунец, тунц, треск, минта, скумбр, сельд, селедк, горбуш, судак, карп, хек$, палтус, креветк, кальмар, миди, морепрод, краб, икр, fish, salmon, trout, tuna, cod, mackerel, herring, pollock, shrimp, prawn, squid, mussel, seafood, crab, caviar',
  'fish-sushi': 'суши, ролл, сашими, sushi, sashimi, maki, poke$',
  eggs: 'яйц, яйцо, яичниц, яичн, омлет, глазун, egg, omelet, omelette, scrambled',
  'eggs-boiled': 'яйцо варен, яйца варен, вареное яйц, вареные яйц, boiled egg',
  grains:
    'рис$, риса$, рисом$, рисов, плов, гречк, гречнев, булгур, кускус, киноа, перлов, пшен, ячнев, круп, гарнир, ризотто, rice, pilaf, risotto, buckwheat, bulgur, couscous, quinoa, grain',
  'grains-porridge':
    'каш, овсян, геркулес, манк, мюсли, гранол, oatmeal, porridge, oats, muesli, granola, cereal',
  'grains-potato': 'картоф, картош, пюре$, potato, mash',
  bread:
    'хлеб, батон, багет, лаваш, булк, булоч, тост, гренк, бутерброд, сэндвич, сендвич, бублик, сушк, сухар, лепешк, пирог, пирож, хачапур, чебурек, крекер, bread, toast, bagel, sandwich, bun$, buns$, baguette, pita, pie$, cracker',
  'bread-croissant': 'круассан, слойк, выпечк, croissant, pastry, danish',
  dairy:
    'молок, молоч, кефир, ряженк, простокваш, сметан, сливк, сливочн, айран, milk, kefir, cream$, sour cream, butter',
  'dairy-yogurt':
    'йогурт, творог, творож, yogurt, yoghurt, cottage, skyr, quark',
  cheese:
    'сыр, моцарел, пармезан, фет, брынз, cheese, mozzarella, parmesan, feta, cheddar, brie, ricotta',
  soup: 'суп, щи$, уха$, бульон, солянк, рассольник, окрошк, харчо, том ям, рамен, гаспачо, soup, broth, ramen, chowder, bisque, gazpacho, minestrone, tom yum',
  'soup-borscht': 'борщ, свекольник, borscht, borsch',
  salad: 'салат, винегрет, оливье, цезарь, salad, coleslaw, caesar',
  'salad-tomato':
    'греческий салат, овощной салат, салат из овощ, салат из помидор, шопск, greek salad',
  pasta:
    'паст, макарон, спагет, лапш, феттучин, пенне, лазань, карбонар, болоньез, вермишел, удон, pasta, spaghetti, noodle, macaroni, penne, lasagn, fettuccine, carbonara, bolognese, udon',
  'pasta-dumplings':
    'пельмен, варени, хинкал, манты$, равиол, вонтон, ravioli, dumpling, gyoza, wonton',
  pizza: 'пицц, pizza',
  fastfood:
    'бургер, гамбургер, чизбургер, хот дог, хотдог, фастфуд, burger, hamburger, cheeseburger, hot dog, hotdog, fast food',
  'fastfood-fries': 'фри$, картофель фри, чипс, fries, chips',
  'fastfood-roll':
    'шаурм, шаверм, донер, буррито, тако$, кесадиль, врап, wrap, burrito, taco, shawarma, doner, quesadilla, gyro',
  sweets:
    'торт, пирожн, кекс, маффин, капкейк, печенье, печенья, печеньк, конфет, сладк, десерт, чизкейк, тирамису, вафл, пряник, зефир, мармелад, пастил, халв, варень, джем, мед$, меда$, медом$, медовик, сырок, эклер, пончик, донат, пудинг, cake, cookie, biscuit, candy, dessert, sweet, cheesecake, tiramisu, waffle, marshmallow, jam$, honey, donut, doughnut, brownie, muffin, cupcake, pudding, eclair',
  'sweets-chocolate':
    'шоколад, нутелл, сникерс, батончик, chocolate, nutella, snickers',
  'sweets-icecream':
    'морожен, пломбир, сорбет, джелато, ice cream, gelato, sorbet, sundae',
  'sweets-pancakes':
    'блин, оладь, сырник, панкейк, pancake, crepe, fritter, syrniki',
  drinks:
    'сок, напит, смузи, коктейл, лимонад, компот, морс, кола$, газиров, квас, кисел, juice, smoothie, drink, soda, cola, lemonade, cocktail, shake',
  'drinks-water': 'вода$, воды$, воду$, минерал, water',
  'drinks-wine':
    'вино$, вина$, пиво, пива$, шампан, коньяк, водк, виски, ром$, сидр, wine, beer, champagne, prosecco, vodka, whisk, rum$, cider',
  coffee:
    'кофе, капучин, латте, американо, эспрессо, раф$, флэт, мокк, какао, coffee, cappuccino, latte, americano, espresso, mocha, flat white, macchiato, cocoa',
  'coffee-tea': 'чай, чая$, чаю$, матча, tea$, teas$, matcha',
  nuts: 'орех, миндал, фундук, кешью, арахис, фисташ, семечк, семена$, nut, almond, hazelnut, cashew, peanut, pistachio, walnut, seed',
  sauces:
    'соус, кетчуп, майонез, горчиц, песто, масло$, заправк, хумус, гуакамол, аджик, sauce, ketchup, mayo, mustard, pesto, dressing, oil$, hummus, guacamole, salsa, gravy',
};

/** Every pickable illustration, in picker grid order; `plate` is the fallback (AC-3.5). */
export const ILLUSTRATION_IDS = CATEGORIES.flatMap((c) => c.items);
export type IllustrationId = (typeof CATEGORIES)[number]['items'][number];
export const illustrationIdSchema = z.enum(
  ILLUSTRATION_IDS as [IllustrationId, ...IllustrationId[]],
);
export const isIllustrationId = (s: unknown): s is IllustrationId =>
  ILLUSTRATION_IDS.includes(s as IllustrationId);

type Category = (typeof CATEGORIES)[number];
const categoryOf = Object.fromEntries(
  CATEGORIES.flatMap((c) => c.items.map((i) => [i, c])),
) as Record<IllustrationId, Category>;
export const categoryIdOf = (id: IllustrationId) => categoryOf[id].id;

const norm = (s: string) =>
  ' ' +
  s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}]+/gu, ' ')
    .trim() +
  ' ';

const STEMS = Object.entries(WORDS).flatMap(([id, words]) =>
  words!.split(/,\s*/).map((stem) => {
    const whole = stem.endsWith('$');
    const needle = ' ' + (whole ? stem.slice(0, -1) + ' ' : stem);
    const type = 'type' in categoryOf[id as IllustrationId] ? 1 : 0;
    return { id: id as IllustrationId, needle, type };
  }),
);

/** Illustration for a dish name, offline and instant (AC-3.1, 3.4–3.6). */
export function matchIllustration(name: string): IllustrationId {
  const s = norm(name);
  let best: {
    id: IllustrationId;
    pos: number;
    len: number;
    type: number;
  } | null = null;
  for (const { id, needle, type } of STEMS) {
    const pos = s.indexOf(needle);
    if (pos < 0) continue;
    const len = needle.length;
    if (
      !best ||
      type > best.type ||
      (type === best.type &&
        (pos < best.pos || (pos === best.pos && len > best.len)))
    )
      best = { id, pos, len, type };
  }
  return best?.id ?? 'plate';
}

/** Preview of a meal without a photo: the dish with the most kcal, the first on a tie (AC-2.2). */
export function mealIllustration(
  items: readonly { illustration: IllustrationId; kcal: number }[],
): IllustrationId {
  let best = items[0];
  for (const i of items) if (i.kcal > best!.kcal) best = i;
  return best?.illustration ?? 'plate';
}
