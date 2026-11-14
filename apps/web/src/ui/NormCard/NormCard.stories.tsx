import type { Meta, StoryObj } from '@storybook/react-vite';
import { useT } from '../../i18n';
import { NormCard } from './NormCard';

const noop = () => {};
const norm = { kcal: 2760, protein: 128, fat: 92, carbs: 355 };

// Sample screen copy (OCT-22 §6); the keys arrive with the profile screen (OCT-87).
const missing = {
  en: 'Add your height and activity to see your goal',
  ru: 'Укажите рост и активность — и норма появится',
};

function Empty() {
  const { locale } = useT();
  return (
    <NormCard state="empty" message={missing[locale === 'ru' ? 'ru' : 'en']} />
  );
}

const meta = {
  title: 'UI/NormCard',
  component: NormCard,
  args: { state: 'norm', norm, badge: 'calc', onHow: noop },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 'var(--content-max-width)' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NormCard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 8.4 */
export const Calculated: Story = {};
/** 8.5: editing, preview of the unsaved goal. */
export const Draft: Story = {
  args: {
    state: 'norm',
    norm: { kcal: 1810, protein: 144, fat: 60, carbs: 173 },
    badge: 'draft',
    onHow: noop,
  },
};
/** 8.9 */
export const Manual: Story = {
  args: {
    state: 'norm',
    norm: { kcal: 2000, protein: 130, fat: 67, carbs: 220 },
    badge: 'manual',
    onHow: noop,
  },
};
/** 8.3: partial profile. */
export const EmptyState: Story = { render: () => <Empty /> };
/** 8.1: first visit, AI configured — two equal paths. */
export const First: Story = {
  args: { state: 'first', onAgent: noop, onForm: noop },
};
/** 8.2: first visit without AI — the form only. */
export const FirstNoAi: Story = { args: { state: 'first', onForm: noop } };
export const Dark: Story = { globals: { theme: 'dark' } };
export const DraftDark: Story = { ...Draft, globals: { theme: 'dark' } };
export const FirstDark: Story = { ...First, globals: { theme: 'dark' } };
export const Russian: Story = { globals: { locale: 'ru' } };
export const FirstRussian: Story = { ...First, globals: { locale: 'ru' } };
export const HowHover: Story = { parameters: { pseudo: { hover: true } } };
