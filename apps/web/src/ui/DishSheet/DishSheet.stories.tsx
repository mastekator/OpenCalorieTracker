import { useState, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { useT } from '../../i18n';
import { Button } from '../Button/Button';
import { DishSheet } from './DishSheet';

type Props = Omit<
  ComponentProps<typeof DishSheet>,
  'onClose' | 'onDone' | 'onDelete'
> & { onDone: (name: string, grams: number) => void; onDelete: () => void };

// Opens on load; the button reopens it so focus return is visible.
function Demo(props: Props) {
  const { t } = useT();
  const [open, setOpen] = useState(true);
  return (
    <>
      <Button variant="tonal" onClick={() => setOpen(true)}>
        {t('edit.dish.title')}
      </Button>
      {open && (
        <DishSheet
          {...props}
          onDone={(name, grams) => {
            props.onDone(name, grams);
            setOpen(false);
          }}
          onDelete={() => {
            props.onDelete();
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

const meta = {
  title: 'UI/DishSheet',
  component: Demo,
  args: {
    original: {
      name: 'Rice with vegetables',
      grams: 150,
      kcal: 300,
      proteinG: 8,
      fatG: 6,
      carbsG: 36,
    },
    grams: 150,
    units: 'metric',
    onDone: fn(),
    onDelete: fn(),
  },
  argTypes: { units: { control: 'inline-radio', options: ['metric', 'us'] } },
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 4.4: clear the name and press Done to see «Enter a name»; the numbers follow the weight only. */
export const Default: Story = {};
export const Dark: Story = { globals: { theme: 'dark' } };
export const Ounces: Story = { args: { units: 'us' } };
export const Desktop: Story = { globals: { viewport: { value: 'desktop' } } };
export const DesktopDark: Story = {
  globals: { viewport: { value: 'desktop' }, theme: 'dark' },
};
export const Russian: Story = {
  args: {
    original: {
      name: 'Рис с овощами',
      grams: 150,
      kcal: 300,
      proteinG: 8,
      fatG: 6,
      carbsG: 36,
    },
  },
  globals: { locale: 'ru' },
};

/** 2.6: a package found by barcode — its serving under the weight and the Open Food Facts credit. */
const yogurt = {
  original: {
    name: 'Greek yogurt 2%',
    grams: 140,
    kcal: 92.4,
    proteinG: 11.2,
    fatG: 2.8,
    carbsG: 5.6,
  },
  grams: 140,
  source: { kind: 'barcode', code: '4607012345677', servingG: 140 },
} as const;
export const Package: Story = { args: yogurt };
export const PackageDark: Story = { args: yogurt, globals: { theme: 'dark' } };
const label = {
  ...yogurt,
  source: { kind: 'label', code: '4607012345677' },
} as const;
export const PackageLabel: Story = { args: label };
export const PackageLabelDark: Story = {
  args: label,
  globals: { theme: 'dark' },
};
const mine = {
  ...yogurt,
  source: {
    kind: 'mine',
    code: '4607012345677',
    savedAt: '2026-11-02T10:00:00Z',
  },
} as const;
export const PackageMine: Story = { args: mine };
export const PackageMineDark: Story = {
  args: mine,
  globals: { theme: 'dark' },
};
