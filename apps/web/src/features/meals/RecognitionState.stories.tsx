import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import type { BarcodeLookup, Product } from '@oct/shared';
import { RecognitionState, type PhotoCodes } from './RecognitionState';

// Stand-in meal photo; the `Gone` story shows the placeholder a deleted photo leaves.
const photo = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 390 280">' +
    '<rect width="390" height="280" fill="#6b4f3a"/>' +
    '<circle cx="195" cy="140" r="110" fill="#f4f1ea"/>' +
    '<circle cx="160" cy="120" r="45" fill="#e2a03f"/>' +
    '<circle cx="235" cy="125" r="38" fill="#5a8f3d"/>' +
    '<circle cx="195" cy="185" r="35" fill="#c0503a"/></svg>',
)}`;

const meta = {
  title: 'Meals/RecognitionState',
  component: RecognitionState,
  args: {
    state: 'loading',
    codes: 'pending',
    ai: 'run',
    photoUrl: photo,
    onRetry: fn(),
    onRetake: fn(),
    onManual: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof RecognitionState>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };

/** 3.1 */
export const Loading: Story = {};
export const LoadingDark: Story = { globals: dark };
/** 3.2 after 10 s */
export const Slow: Story = { args: { state: 'slow' } };
export const SlowDark: Story = { args: { state: 'slow' }, globals: dark };
/** 3.3 */
export const Unavailable: Story = { args: { state: 'unavailable' } };
export const UnavailableDark: Story = {
  args: { state: 'unavailable' },
  globals: dark,
};
/** 3.4 */
export const Quota: Story = { args: { state: 'quota' } };
export const QuotaDark: Story = { args: { state: 'quota' }, globals: dark };
/** 3.5 */
export const Failed: Story = { args: { state: 'failed' } };
export const FailedDark: Story = { args: { state: 'failed' }, globals: dark };
/** 3.5 without «Try again»: the photo is gone or expired. */
export const Gone: Story = {
  args: { state: 'gone', photoUrl: '/api/photos/gone' },
};
export const GoneDark: Story = {
  args: { state: 'gone', photoUrl: '/api/photos/gone' },
  globals: dark,
};
/** 3.6 */
export const Empty: Story = { args: { state: 'empty' } };
export const EmptyDark: Story = { args: { state: 'empty' }, globals: dark };
/** 3.7 */
export const Offline: Story = { args: { state: 'offline' } };
export const OfflineDark: Story = { args: { state: 'offline' }, globals: dark };
/** OCT-370: the chosen photo is still being prepared and uploaded. */
export const Uploading: Story = { args: { uploading: true } };
export const UploadingDark: Story = {
  args: { uploading: true },
  globals: dark,
};
/** A preview the browser can't show (HEIC on desktop): the placeholder. */
export const UploadingNoPreview: Story = {
  args: { uploading: true, photoUrl: 'blob:unreadable' },
};
export const UploadFailed: Story = { args: { state: 'upload_failed' } };
export const UploadFailedDark: Story = {
  args: { state: 'upload_failed' },
  globals: dark,
};
/** Recalculating a saved meal: no «Retake», every way out leads back to the entry. */
const recalc = { onRetake: undefined };
export const RecalcSlow: Story = { args: { ...recalc, state: 'slow' } };
export const RecalcSlowDark: Story = {
  args: { ...recalc, state: 'slow' },
  globals: dark,
};
export const RecalcUnavailable: Story = {
  args: { ...recalc, state: 'unavailable' },
};
export const RecalcUnavailableDark: Story = {
  args: { ...recalc, state: 'unavailable' },
  globals: dark,
};
export const RecalcQuota: Story = { args: { ...recalc, state: 'quota' } };
export const RecalcQuotaDark: Story = {
  args: { ...recalc, state: 'quota' },
  globals: dark,
};
export const RecalcFailed: Story = { args: { ...recalc, state: 'failed' } };
export const RecalcFailedDark: Story = {
  args: { ...recalc, state: 'failed' },
  globals: dark,
};
export const RecalcGone: Story = {
  args: { ...recalc, state: 'gone', photoUrl: '/api/photos/gone' },
};
export const RecalcGoneDark: Story = {
  args: { ...recalc, state: 'gone', photoUrl: '/api/photos/gone' },
  globals: dark,
};
export const RecalcEmpty: Story = { args: { ...recalc, state: 'empty' } };
export const RecalcEmptyDark: Story = {
  args: { ...recalc, state: 'empty' },
  globals: dark,
};
export const RecalcOffline: Story = { args: { ...recalc, state: 'offline' } };
export const RecalcOfflineDark: Story = {
  args: { ...recalc, state: 'offline' },
  globals: dark,
};
export const RecalcRussian: Story = {
  args: { ...recalc, state: 'unavailable' },
  globals: { locale: 'ru' },
};
export const Russian: Story = {
  args: { state: 'slow' },
  globals: { locale: 'ru' },
};
export const Desktop: Story = {
  args: { state: 'failed' },
  globals: { viewport: { value: 'desktop' } },
};

// Steps of OCT-313 §1: what POST /photos/:id/barcodes answered.
const yogurt: Product = {
  code: '4607012345678',
  name: 'Greek yogurt 2%',
  brand: null,
  kcal100: 66,
  protein100: 8,
  fat100: 2,
  carbs100: 4,
  per: 'g',
  servingG: 140,
  servingText: null,
};
const hit = (
  result: BarcodeLookup,
  code = '4607012345678',
): Exclude<PhotoCodes, string>[number] => ({ code, result });
const steps = {
  /** 1.1 */
  Searching: { codes: 'pending' },
  /** 1.2 */
  FoundOff: { codes: [hit({ product: yogurt, from: 'off', off: 'found' })] },
  /** 1.3 */
  OffDown: { codes: [hit({ product: null, from: null, off: 'down' })] },
  OffMissing: { codes: [hit({ product: null, from: null, off: 'missing' })] },
  /** 1.4 */
  NoBarcode: { codes: [] },
  /** 1.5 */
  OffDisabled: { codes: [hit({ product: null, from: null, off: 'disabled' })] },
  OffBlocked: { codes: [hit({ product: null, from: null, off: 'blocked' })] },
  /** 1.6 */
  NoAi: { codes: 'pending', ai: 'none' },
  /** Own product: steps 2–3 not needed. */
  Mine: { codes: [hit({ product: yogurt, from: 'mine', off: 'skipped' })] },
  /** E-11 */
  TwoBarcodes: {
    codes: [
      hit({ product: yogurt, from: 'off', off: 'found' }),
      hit({ product: null, from: null, off: 'missing' }, '96385074'),
    ],
  },
  /** The barcode read failed: steps 1–2 skipped. */
  BarcodesFailed: { codes: 'failed' },
} satisfies Record<string, Partial<Story['args']>>;
export const StepsSearching: Story = { args: steps.Searching };
export const StepsSearchingDark: Story = {
  args: steps.Searching,
  globals: dark,
};
export const StepsFoundOff: Story = { args: steps.FoundOff };
export const StepsFoundOffDark: Story = { args: steps.FoundOff, globals: dark };
export const StepsOffDown: Story = { args: steps.OffDown };
export const StepsOffDownDark: Story = { args: steps.OffDown, globals: dark };
export const StepsOffMissing: Story = { args: steps.OffMissing };
export const StepsOffMissingDark: Story = {
  args: steps.OffMissing,
  globals: dark,
};
export const StepsNoBarcode: Story = { args: steps.NoBarcode };
export const StepsNoBarcodeDark: Story = {
  args: steps.NoBarcode,
  globals: dark,
};
export const StepsOffDisabled: Story = { args: steps.OffDisabled };
export const StepsOffDisabledDark: Story = {
  args: steps.OffDisabled,
  globals: dark,
};
export const StepsOffBlocked: Story = { args: steps.OffBlocked };
export const StepsOffBlockedDark: Story = {
  args: steps.OffBlocked,
  globals: dark,
};
export const StepsNoAi: Story = { args: steps.NoAi };
export const StepsNoAiDark: Story = { args: steps.NoAi, globals: dark };
export const StepsMine: Story = { args: steps.Mine };
export const StepsMineDark: Story = { args: steps.Mine, globals: dark };
export const StepsTwoBarcodes: Story = { args: steps.TwoBarcodes };
export const StepsTwoBarcodesDark: Story = {
  args: steps.TwoBarcodes,
  globals: dark,
};
export const StepsBarcodesFailed: Story = { args: steps.BarcodesFailed };
export const StepsBarcodesFailedDark: Story = {
  args: steps.BarcodesFailed,
  globals: dark,
};
export const StepsRussian: Story = {
  args: steps.OffDown,
  globals: { locale: 'ru' },
};
export const StepsDesktop: Story = {
  args: steps.FoundOff,
  globals: { viewport: { value: 'desktop' } },
};
