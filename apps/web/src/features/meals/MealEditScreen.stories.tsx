import { useEffect, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Meal } from '@oct/shared';
import { fn } from 'storybook/test';
import { Router, useLocation } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { LeaveGuard } from '../../app/LeaveGuard';
import { ToastProvider } from '../../ui/Toast/Toast';
import { MealEditScreen } from './MealEditScreen';
import { MEAL_EDIT_PATH } from './RecognitionScreen';

type Props = ComponentProps<typeof MealEditScreen>;

/** Close navigates like the app, so the leave guard asks (4.7); `leave` opens it, `deleteAll` shows 4.6. */
function Screen({
  leave,
  deleteAll,
  ...props
}: Props & { leave?: boolean; deleteAll?: boolean }) {
  const [, navigate] = useLocation();
  const close = () => {
    props.onClose();
    navigate('/');
  };
  useEffect(() => {
    if (deleteAll)
      document
        .querySelectorAll<HTMLButtonElement>('.dish-row__delete')
        .forEach((b) => b.click());
    if (!leave) return;
    if (!props.meal) return navigate('/');
    // A saved meal asks only after an edit (6.8): pick another meal type, leave once it is marked.
    document.querySelectorAll<HTMLButtonElement>('[role="radio"]')[1]?.click();
    const timer = setTimeout(() => navigate('/'));
    return () => clearTimeout(timer);
  }, [leave, deleteAll, navigate, props.meal]);
  return <MealEditScreen {...props} onClose={close} />;
}

const dishes = [
  {
    name: 'Buckwheat',
    grams: 150,
    kcal: 165,
    proteinG: 6,
    fatG: 1.5,
    carbsG: 33,
    confidence: 0.97,
  },
  {
    name: 'Chicken cutlet',
    grams: 120,
    kcal: 260,
    proteinG: 22,
    fatG: 16,
    carbsG: 8,
    confidence: 0.6,
  },
  {
    name: 'Tomato salad',
    grams: 90,
    kcal: 70,
    proteinG: 1,
    fatG: 6,
    carbsG: 4,
    confidence: 0.3,
  },
];

const meta = {
  title: 'Meals/MealEditScreen',
  component: MealEditScreen,
  parameters: { layout: 'fullscreen' },
  decorators: (Story) => (
    <Router hook={memoryLocation({ path: MEAL_EDIT_PATH }).hook}>
      <ToastProvider>
        <LeaveGuard>
          <Story />
        </LeaveGuard>
      </ToastProvider>
    </Router>
  ),
  render: (args, { parameters }) => (
    <Screen
      {...args}
      leave={parameters.leave as boolean}
      deleteAll={parameters.deleteAll as boolean}
    />
  ),
  args: {
    dishes,
    units: 'metric',
    onSave: fn(async () => {}),
    onClose: fn(),
    now: () => new Date(2026, 10, 15, 13, 24),
  },
} satisfies Meta<typeof MealEditScreen>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };
const failing = { onSave: fn(() => Promise.reject(new Error('quota'))) };

export const Recognized: Story = {};
export const RecognizedDark: Story = { globals: dark };

// Only the body scrolls; the footer stays at the bottom edge with nothing below it (OCT-239).
const longList = { dishes: [...dishes, ...dishes, ...dishes] };
export const LongList: Story = { args: longList };
export const LongListDark: Story = { args: longList, globals: dark };
/** 4.10 */
export const Ounces: Story = { args: { units: 'us' } };
export const OuncesDark: Story = { args: { units: 'us' }, globals: dark };
/** Manual entry without the sheet: «No dishes yet», the photo slot, Save disabled. */
export const NoDishes: Story = { args: { dishes: [] } };
export const NoDishesDark: Story = { args: { dishes: [] }, globals: dark };
/** AC-5.5: «Manually» on Today opens the screen with the sheet. */
const manual = { dishes: [], manual: 'user' } satisfies Partial<Props>;
export const Manual: Story = { args: manual };
export const ManualDark: Story = { args: manual, globals: dark };
/** A server test photo, served by Storybook's staticDirs as /api/photos/<id>. */
const photoId = 'salad.jpg';
/** 5.3: AI not set up; the banner shows above the header, the sheet is open. */
const notConfigured = {
  dishes: [],
  manual: 'not_configured',
  photoId,
} satisfies Partial<Props>;
export const NotConfigured: Story = { args: notConfigured };
export const NotConfiguredDark: Story = { args: notConfigured, globals: dark };
const noVision = {
  dishes: [],
  manual: 'no_vision',
  photoId,
} satisfies Partial<Props>;
export const NoVision: Story = { args: noVision };
export const NoVisionDark: Story = { args: noVision, globals: dark };
/** After 3.2–3.4 «Enter manually». */
const aiDown = {
  dishes: [],
  manual: 'ai_down',
  photoId,
} satisfies Partial<Props>;
export const AiDown: Story = { args: aiDown };
export const AiDownDark: Story = { args: aiDown, globals: dark };
/** 4.8: press Save to see the error banner and «Try again». */
export const SaveFails: Story = { args: failing };
export const SaveFailsDark: Story = { args: failing, globals: dark };
/** 4.6: every dish deleted, «Undo» toast for the last one, Save disabled. */
export const AllDeleted: Story = { parameters: { deleteAll: true } };
export const AllDeletedDark: Story = {
  parameters: { deleteAll: true },
  globals: dark,
};
/** 4.7: Close, Esc or «Back»; asks even without edits, focus on Stay. */
export const LeaveDialog: Story = { parameters: { leave: true } };
export const LeaveDialogDark: Story = {
  parameters: { leave: true },
  globals: dark,
};
/** §5: a trash button next to the pencil, no swipe. */
export const Desktop: Story = { globals: { viewport: { value: 'desktop' } } };
export const DesktopDark: Story = {
  globals: { viewport: { value: 'desktop' }, theme: 'dark' },
};
/** OCT-19 3.2: 00:35, «Yesterday | Today» under the meal type, a snack by default. */
const lateSnack = { now: () => new Date(2026, 10, 15, 0, 35) };
export const LateSnack: Story = { args: lateSnack };
export const LateSnackDark: Story = { args: lateSnack, globals: dark };
/** AC-2.11, AC-2.12: «Add an entry for this day», lunch at 13:00, the time field. */
const pastDay = { date: '2026-11-10' };
export const PastDay: Story = { args: pastDay };
export const PastDayDark: Story = { args: pastDay, globals: dark };
/** 4.3: a similar dish from the history under the cutlet; «Same as last time» shows the toast. */
const lastTime: Story = {
  beforeEach: () => {
    const real = window.fetch;
    window.fetch = async (input, init) =>
      String(input) === '/api/dishes/previous'
        ? Response.json([
            null,
            {
              mealId: 1,
              eatenAt: '2026-11-12T12:30:00.000Z',
              grams: 150,
              kcal: 320,
              proteinG: 27,
              fatG: 20,
              carbsG: 10,
              illustration: 'meat',
            },
            null,
          ])
        : real(input, init);
    return () => {
      window.fetch = real;
    };
  },
};
export const LastTime: Story = lastTime;
export const LastTimeDark: Story = { ...lastTime, globals: dark };

/** OCT-19 §3.1: a saved meal — «Dinner, Nov 12», «Date and time», «Delete entry» under Save. */
const savedMeal: Meal = {
  id: 1,
  clientId: 'saved',
  eatenAt: new Date(2026, 10, 12, 19, 55).toISOString(),
  tzOffsetMin: -new Date(2026, 10, 12, 19, 55).getTimezoneOffset(),
  localDate: '2026-11-12',
  mealType: 'dinner',
  photo: null,
  recalcOffer: false,
  items: dishes.slice(0, 2).map((d) => ({
    ...d,
    source: 'ai',
    aiProvider: null,
    aiModel: null,
    illustration: 'grains',
    illustrationManual: false,
  })),
  kcal: 425,
  proteinG: 28,
  fatG: 17.5,
  carbsG: 41,
};
const existing = {
  meal: savedMeal,
  dishes: [],
  onPatch: fn(async () => {}),
  onDelete: fn(),
} satisfies Partial<Props>;
export const Existing: Story = { args: existing };
export const ExistingDark: Story = { args: existing, globals: dark };
export const ExistingDesktop: Story = {
  args: existing,
  globals: { viewport: { value: 'desktop' } },
};
export const ExistingDesktopDark: Story = {
  args: existing,
  globals: { viewport: { value: 'desktop' }, theme: 'dark' },
};
/** OCT-196: the photo did not load (offline, retention): a placeholder, not a broken image. */
const brokenPhoto = {
  ...existing,
  meal: { ...savedMeal, photo: { id: 'missing.jpg', full: false } },
} satisfies Partial<Props>;
export const BrokenPhoto: Story = { args: brokenPhoto };
export const BrokenPhotoDesktop: Story = {
  args: brokenPhoto,
  globals: { viewport: { value: 'desktop' } },
};
/** OCT-206: the server refused the entry (a date in the future): fix and save again, or delete. */
const refused = {
  ...existing,
  refused: 'validation_failed',
} satisfies Partial<Props>;
export const Refused: Story = { args: refused };
export const RefusedDark: Story = { args: refused, globals: dark };
/** OCT-206: the server refused the photo taken offline; saving again drops it. */
const refusedPhoto = {
  ...existing,
  refused: 'photo_invalid',
} satisfies Partial<Props>;
export const RefusedPhoto: Story = { args: refusedPhoto };
export const RefusedPhotoDark: Story = { args: refusedPhoto, globals: dark };
/** E-2.3: every dish deleted, «Delete entry» replaces Save. */
export const ExistingAllDeleted: Story = {
  args: existing,
  parameters: { deleteAll: true },
};
export const ExistingAllDeletedDark: Story = {
  args: existing,
  parameters: { deleteAll: true },
  globals: dark,
};
/** 6.8: after an edit, «Save changes?»; without one, leaving asks nothing. */
export const ExistingLeave: Story = {
  args: existing,
  parameters: { leave: true },
};
export const ExistingLeaveDark: Story = {
  args: existing,
  parameters: { leave: true },
  globals: dark,
};

/** OCT-62 (5.6): entered by hand while AI was down, AI is back — «AI is back» on top. */
const recalcOffer = {
  ...existing,
  meal: {
    ...savedMeal,
    photo: { id: 'p1', full: true },
    recalcOffer: true,
    items: savedMeal.items.map((i) => ({ ...i, source: 'manual' as const })),
  },
  onRecalc: fn(),
  onDismissRecalc: fn(),
} satisfies Partial<Props>;
export const RecalcBanner: Story = { args: recalcOffer };
export const RecalcBannerDark: Story = { args: recalcOffer, globals: dark };
/** No banner: «Recalculate from photo» under the totals (OCT-62 design). */
const recalcAction = {
  ...recalcOffer,
  meal: { ...recalcOffer.meal, recalcOffer: false },
} satisfies Partial<Props>;
export const RecalcAction: Story = { args: recalcAction };
export const RecalcActionDark: Story = { args: recalcAction, globals: dark };
export const RecalcActionDesktop: Story = {
  args: recalcAction,
  globals: { viewport: { value: 'desktop' } },
};
export const RecalcActionDesktopDark: Story = {
  args: recalcAction,
  globals: { viewport: { value: 'desktop' }, theme: 'dark' },
};
