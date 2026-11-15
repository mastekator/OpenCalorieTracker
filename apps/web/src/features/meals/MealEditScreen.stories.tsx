import { useEffect, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
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
    if (leave) navigate('/');
  }, [leave, deleteAll, navigate]);
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
    now: new Date(2026, 10, 15, 13, 24),
  },
} satisfies Meta<typeof MealEditScreen>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };
const failing = { onSave: fn(() => Promise.reject(new Error('quota'))) };

export const Recognized: Story = {};
export const RecognizedDark: Story = { globals: dark };
/** 4.10 */
export const Ounces: Story = { args: { units: 'us' } };
export const OuncesDark: Story = { args: { units: 'us' }, globals: dark };
/** Manual entry before OCT-60: no dishes, Save disabled. */
export const NoDishes: Story = { args: { dishes: [] } };
export const NoDishesDark: Story = { args: { dishes: [] }, globals: dark };
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
