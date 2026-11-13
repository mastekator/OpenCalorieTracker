import type { Meta, StoryObj } from '@storybook/react-vite';
import { useT } from '../../i18n';
import { Button } from './Button';

type Args = Parameters<typeof Button>[0];

// Labels come from the dictionary so the locale toolbar switches RU / EN.
function Labelled(args: Args) {
  const { t } = useT();
  return (
    <Button {...args}>
      {args.loading ? t('common.loading') : t('screens.login')}
    </Button>
  );
}

const meta = {
  title: 'UI/Button',
  component: Button,
  render: (args) => <Labelled {...args} />,
  args: { variant: 'primary', small: false, loading: false, disabled: false },
  argTypes: {
    variant: {
      control: 'inline-radio',
      options: ['primary', 'tonal', 'plain', 'danger', 'danger-plain'],
    },
  },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};
export const Tonal: Story = { args: { variant: 'tonal' } };
export const Plain: Story = { args: { variant: 'plain' } };
export const Danger: Story = { args: { variant: 'danger' } };
export const DangerPlain: Story = { args: { variant: 'danger-plain' } };
export const Small: Story = { args: { variant: 'tonal', small: true } };
export const Disabled: Story = { args: { disabled: true } };
export const Loading: Story = { args: { loading: true } };
export const Hover: Story = {
  args: { variant: 'plain' },
  parameters: { pseudo: { hover: true } },
};
export const Pressed: Story = { parameters: { pseudo: { active: true } } };
export const FocusVisible: Story = {
  parameters: { pseudo: { focusVisible: true } },
};

const variants = [
  'primary',
  'tonal',
  'plain',
  'danger',
  'danger-plain',
] as const;

/** Every variant in every state, side by side. */
export const Matrix: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
      {variants.map((variant) => (
        <div key={variant} style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <code>{variant}</code>
          <Labelled variant={variant} />
          <Labelled variant={variant} disabled />
          <Labelled variant={variant} loading />
          <div>
            <Labelled variant={variant} small />
          </div>
        </div>
      ))}
    </div>
  ),
};

/** Long text wraps instead of being cut (iPhone SE, Dynamic Type). */
export const LongLabel: Story = {
  render: (args) => {
    const { t } = useT();
    return <Button {...args}>{t('errors.ai_not_configured')}</Button>;
  },
};
