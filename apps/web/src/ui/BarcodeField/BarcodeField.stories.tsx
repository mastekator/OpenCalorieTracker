import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fireEvent, within } from 'storybook/test';
import type { Product } from '@oct/shared';
import type { BarcodeResult } from '../../data/products';
import { BarcodeField } from './BarcodeField';

const YOGURT: Product = {
  code: '4607012345677',
  name: 'Greek yogurt 2%',
  brand: null,
  kcal100: 66,
  protein100: 8,
  fat100: 2,
  carbs100: 4,
  per: 'g',
  servingG: 140,
  servingText: '140 g',
};

/** The answer every «Find» gets; none: searching forever. */
function Demo({ result }: { result?: BarcodeResult }) {
  const [value, setValue] = useState('');
  return (
    <BarcodeField
      value={value}
      onChange={setValue}
      lookup={() =>
        result ? Promise.resolve(result) : new Promise<never>(() => {})
      }
      onResult={() => {}}
    />
  );
}

const meta = {
  title: 'UI/BarcodeField',
  component: Demo,
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

const find =
  (code = YOGURT.code) =>
  async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const input = await within(canvasElement).findByRole('textbox');
    fireEvent.change(input, { target: { value: code } });
    fireEvent.keyDown(input, { key: 'Enter' });
  };
const none = (off: BarcodeResult['off']): BarcodeResult => ({
  product: null,
  from: null,
  off,
});
const found = (from: 'off' | 'mine' | 'local'): BarcodeResult => ({
  product: YOGURT,
  from,
  off: 'found',
});

/** One story per state (OCT-313 §3), each in both themes. */
const state = (result: BarcodeResult | undefined, code?: string): Story => ({
  args: { result },
  play: find(code),
});
const dark = (story: Story): Story => ({
  ...story,
  globals: { theme: 'dark' },
});

/** 3.1 */
export const Empty: Story = {};
export const EmptyDark: Story = dark(Empty);
/** 3.2: spinner on the button, the field stays editable. */
export const Searching = state(undefined);
export const SearchingDark = dark(Searching);
export const FoundOff = state(found('off'));
export const FoundOffDark = dark(FoundOff);
export const FoundMine = state(found('mine'));
export const FoundMineDark = dark(FoundMine);
export const FoundLocal = state(found('local'));
export const FoundLocalDark = dark(FoundLocal);
/** 3.3: the sheet moves focus to «Name». */
export const NotFound = state(none('missing'));
export const NotFoundDark = dark(NotFound);
/** 3.5 */
export const OffDown = state(none('down'));
export const OffDownDark = dark(OffDown);
/** 3.6 (AC-4.9) */
export const Offline = state(none('offline'));
export const OfflineDark = dark(Offline);
/** Lookup off or blocked by the admin: own products only. */
export const OffDisabled = state(none('disabled'));
export const OffDisabledDark = dark(OffDisabled);
export const WrongLength = state(undefined, '12345');
export const WrongLengthDark = dark(WrongLength);
export const Russian: Story = {
  ...state(none('disabled')),
  globals: { locale: 'ru' },
};
