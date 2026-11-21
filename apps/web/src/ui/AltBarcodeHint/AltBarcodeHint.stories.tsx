import { fn } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { AltBarcodeHint } from './AltBarcodeHint';

const I = '8997035601383';
const meta = {
  title: 'UI/AltBarcodeHint',
  component: AltBarcodeHint,
  args: {
    onReplace: fn(),
    state: {
      kind: 'offer',
      code: I,
      product: { name: 'Pocari Ion Water 500ml', kcal100: 11, mine: false },
    },
  },
} satisfies Meta<typeof AltBarcodeHint>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };
const noProduct = { state: { kind: 'offer', code: I } } as const;
const searching = { state: { kind: 'searching', code: I } } as const;
const result = (
  off: 'missing' | 'offline' | 'down' | 'disabled' | 'blocked',
  ai = false,
) =>
  ({
    state: { kind: 'result', result: { product: null, from: null, off }, ai },
  }) as const;
const found = {
  state: {
    kind: 'result',
    ai: false,
    result: {
      product: {
        code: I,
        name: 'Pocari Ion Water 500ml',
        brand: null,
        kcal100: 11,
        protein100: 0,
        fat100: 0,
        carbs100: 2.7,
        per: 'ml',
        servingG: 500,
        servingText: null,
      },
      from: 'off',
      off: 'found',
    },
  },
} as const;

/** 2.1: both codes found — the product of I, «Replace». */
export const Product: Story = {};
export const ProductDark: Story = { globals: dark };
export const ProductRussian: Story = { globals: { locale: 'ru' } };
/** 3.1: neither found — only the code. */
export const CodeOnly: Story = { args: noProduct };
export const CodeOnlyDark: Story = { args: noProduct, globals: dark };
/** 3.2: after «Replace» without a product. */
export const Searching: Story = { args: searching };
export const SearchingDark: Story = { args: searching, globals: dark };
/** 2.2: found. */
export const Found: Story = { args: found };
export const FoundDark: Story = { args: found, globals: dark };
/** 3.3 and section 5: not found and the other answers. */
export const NotFound: Story = { args: result('missing') };
export const NotFoundDark: Story = { args: result('missing'), globals: dark };
export const NotFoundAi: Story = { args: result('missing', true) };
export const Offline: Story = { args: result('offline') };
export const OffDown: Story = { args: result('down') };
export const OffDownDark: Story = { args: result('down'), globals: dark };
export const OffDisabled: Story = { args: result('disabled') };
export const OffBlocked: Story = { args: result('blocked') };
