import type { RecognizedDish } from '../recognition.js';
import { round1, type DishUnit } from '../units.js';
import { amountGrams, defaultAmount } from './amount.js';
import type {
  BarcodeLookup,
  PhotoBarcodesResponse,
  Product,
} from './barcodes.js';

/** A recognized dish with the package hints of ADR-0034 §2. */
export type PackageHintDish = RecognizedDish & {
  /** The code from the `<barcodes>` tag this dish is the package of. */
  barcode?: string | null;
  /** The numbers were read from the package's nutrition table. */
  label?: boolean;
  /** The printed digits that differ from `barcode`, looked up by the server (ADR-0036 §3). */
  printed?: { code: string; result: BarcodeLookup };
};

/** A dish for the edit screen after `mergePackages`. */
export type MergedDish = Omit<RecognizedDish, 'confidence' | 'ref' | 'unit'> & {
  unit: DishUnit;
  source: 'ai' | 'barcode' | 'label';
  barcode: string | null;
  /** AI dishes only. */
  confidence?: number;
  /** `source: 'barcode'`: whose product the numbers are (OFF needs attribution). */
  from?: NonNullable<BarcodeLookup['from']>;
  /** Found without kcal and no label: the AI's estimate, ask to check it (E-12). */
  check?: true;
  /** Another code the AI read on the package, offered as «Replace» (ADR-0036 §4). */
  alt?: {
    code: string;
    product: Product | null;
    from?: NonNullable<BarcodeLookup['from']>;
  };
};

const NAME_MAX = 80;

/** "Found" in ADR-0036 §4: a product with kcal. */
const isHit = (
  r: BarcodeLookup | undefined,
): r is BarcodeLookup & {
  product: Product & { kcal100: number };
  from: NonNullable<BarcodeLookup['from']>;
} => r?.product?.kcal100 != null && r.from != null;

export function fromProduct(
  product: Product,
  kcal100: number,
  fallbackName: string,
) {
  const grams = amountGrams(product, defaultAmount(product));
  const of = (per100: number | null) => round1(((per100 ?? 0) * grams) / 100);
  return {
    name: (product.name ?? product.brand ?? fallbackName).slice(0, NAME_MAX),
    grams,
    kcal: of(kcal100),
    proteinG: of(product.protein100),
    fatG: of(product.fat100),
    carbsG: of(product.carbs100),
    unit: product.per,
  };
}

/**
 * Glues the AI's dishes and the products found by the photo's barcodes (ADR-0034 §2).
 * One code gives one dish (E-11): later AI dishes with the same code are dropped.
 */
export function mergePackages(
  dishes: PackageHintDish[],
  lookups: PhotoBarcodesResponse['codes'],
): MergedDish[] {
  const found = new Map<string, BarcodeLookup>();
  for (const { code, result } of lookups)
    if (!found.has(code)) found.set(code, result);
  const used = new Set<string>();
  const out: MergedDish[] = [];

  for (const dish of dishes) {
    const { barcode = null, label, confidence } = dish;
    const { name, grams, kcal, proteinG, fatG, carbsG } = dish;
    const unit: DishUnit = dish.unit === 'ml' ? 'ml' : 'g';
    const values = { name, grams, kcal, proteinG, fatG, carbsG, unit };
    if (barcode !== null) {
      if (used.has(barcode)) continue;
      used.add(barcode);
    }
    const lookup = barcode === null ? undefined : found.get(barcode);
    const printed =
      dish.printed && !used.has(dish.printed.code) ? dish.printed : undefined;
    // ADR-0036 §4: the printed code's product wins over a decoder's code that found none.
    if (printed && isHit(printed.result) && !isHit(lookup)) {
      used.add(printed.code);
      const { product, from } = printed.result;
      out.push({
        ...fromProduct(product, product.kcal100, values.name),
        source: 'barcode',
        barcode: printed.code,
        from,
      });
      continue;
    }
    const alt =
      printed && barcode !== null
        ? isHit(lookup)
          ? isHit(printed.result)
            ? {
                code: printed.code,
                product: printed.result.product,
                from: printed.result.from,
              }
            : undefined
          : { code: printed.code, product: null }
        : undefined;
    const product = lookup?.product ?? null;
    const from = lookup?.from ?? null;
    if (product?.kcal100 != null && from) {
      out.push({
        ...fromProduct(product, product.kcal100, values.name),
        source: 'barcode',
        barcode,
        from,
        ...(alt && { alt }),
      });
    } else if (label) {
      const name = product?.name?.slice(0, NAME_MAX) ?? values.name;
      out.push({
        ...values,
        name,
        unit: product?.per ?? unit,
        source: 'label',
        barcode,
        ...(alt && { alt }),
      });
    } else if (product) {
      const name = product.name?.slice(0, NAME_MAX) ?? values.name;
      out.push({
        ...values,
        name,
        unit: product.per,
        source: 'ai',
        barcode,
        confidence,
        check: true,
        ...(alt && { alt }),
      });
    } else {
      out.push({
        ...values,
        source: 'ai',
        barcode,
        confidence,
        ...(alt && { alt }),
      });
    }
  }

  // A product without kcal and no AI dish has no numbers: the client offers the label from `lookups`.
  for (const [code, { product, from }] of found) {
    if (used.has(code) || product?.kcal100 == null || !from) continue;
    out.push({
      ...fromProduct(product, product.kcal100, code),
      source: 'barcode',
      barcode: code,
      from,
    });
  }
  return out;
}
