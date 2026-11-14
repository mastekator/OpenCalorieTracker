import type { Meta, StoryObj } from '@storybook/react-vite';
import { remainingOf, type Macros } from '@oct/shared';
import { atPath } from '../../ui/navStory';
import { RemainingCard } from './RemainingCard';

const NORM: Macros = { kcal: 2100, proteinG: 120, fatG: 70, carbsG: 240 };
const day = (eaten: Macros, norm: Macros | null = NORM) => ({
  eaten,
  norm,
  remaining: norm && remainingOf(norm, eaten),
});

const meta = {
  title: 'Diary/RemainingCard',
  component: RemainingCard,
  decorators: [atPath],
  args: {
    ...day({ kcal: 1240, proteinG: 68, fatG: 52, carbsG: 141 }),
    weekRemainingKcal: 7270,
  },
} satisfies Meta<typeof RemainingCard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 2.1 */
export const Normal: Story = {};
/** 2.2: kcal over, fat over, protein and carbs still left (AC-1.5). */
export const Over: Story = {
  args: {
    ...day({ kcal: 2240, proteinG: 96, fatG: 82, carbsG: 232 }),
    weekRemainingKcal: 6270,
  },
};
/** Exactly the norm: «0 kcal left» (E-1.1). */
export const AtNorm: Story = {
  args: day({ kcal: 2100, proteinG: 120, fatG: 70, carbsG: 240 }),
};
/** 2.4 */
export const Empty: Story = {
  args: day({ kcal: 0, proteinG: 0, fatG: 0, carbsG: 0 }),
};
export const WeekOver: Story = { args: { weekRemainingKcal: -1350 } };
/** 2.3 */
export const NoNorm: Story = {
  args: {
    ...day({ kcal: 1240, proteinG: 68, fatG: 52, carbsG: 141 }, null),
    weekRemainingKcal: undefined,
  },
};
export const WeekFocusVisible: Story = {
  parameters: { pseudo: { focusVisible: true } },
};
export const Desktop: Story = {
  globals: { viewport: { value: 'desktop' } },
  decorators: [(Story) => <div style={{ maxWidth: 560 }}>{Story()}</div>],
};
