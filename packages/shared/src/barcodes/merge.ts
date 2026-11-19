import type { RecognizedDish } from '../recognition.js';
import { round1 } from '../units.js';
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
};

/** A dish for the edit screen after `mergePackages`. */
export type MergedDish = Omit<RecognizedDish, 'confidence' | 'ref'> & {
  source: 'ai' | 'barcode' | 'label';
  barcode: string | null;
  /** AI dishes only. */
  confidence?: number;
  /** `source: 'barcode'`: whose product the numbers are (OFF needs attribution). */
  from?: NonNullable<BarcodeLookup['from']>;
  /** Found without kcal and no label: the AI's estimate, ask to check it (E-12). */
  check?: true;
};

const NAME_MAX = 80;

function fromProduct(product: Product, kcal100: number, fallbackName: string) {
  const grams = round1(Math.max(product.servingG ?? 100, 0.1));
  const of = (per100: number | null) => round1(((per100 ?? 0) * grams) / 100);
  return {
    name: (product.name ?? product.brand ?? fallbackName).slice(0, NAME_MAX),
    grams,
    kcal: of(kcal100),
    proteinG: of(product.protein100),
    fatG: of(product.fat100),
    carbsG: of(product.carbs100),
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
    const values = { name, grams, kcal, proteinG, fatG, carbsG };
    if (barcode !== null) {
      if (used.has(barcode)) continue;
      used.add(barcode);
    }
    const product =
      barcode === null ? null : (found.get(barcode)?.product ?? null);
    const from = barcode === null ? null : (found.get(barcode)?.from ?? null);
    if (product?.kcal100 != null && from) {
      out.push({
        ...fromProduct(product, product.kcal100, values.name),
        source: 'barcode',
        barcode,
        from,
      });
    } else if (label) {
      const name = product?.name?.slice(0, NAME_MAX) ?? values.name;
      out.push({ ...values, name, source: 'label', barcode });
    } else if (product) {
      const name = product.name?.slice(0, NAME_MAX) ?? values.name;
      out.push({
        ...values,
        name,
        source: 'ai',
        barcode,
        confidence,
        check: true,
      });
    } else {
      out.push({ ...values, source: 'ai', barcode, confidence });
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
