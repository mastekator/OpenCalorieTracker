import type { Meta, StoryObj } from '@storybook/react-vite';
import { useT } from '../../i18n';
import { Banner } from './Banner';

const tones = ['notice', 'warning', 'danger', 'accent'] as const;
type Args = Parameters<typeof Banner>[0];

// Text comes from the dictionary so the locale toolbar switches RU / EN.
function Texted(args: Args) {
  const { t } = useT();
  return (
    <Banner {...args} title={t('errors.ai_unavailable')}>
      {t('errors.ai_not_configured')}
    </Banner>
  );
}

const meta = {
  title: 'UI/Banner',
  component: Banner,
  render: (args) => <Texted {...args} />,
  args: { tone: 'notice' },
  argTypes: { tone: { control: 'inline-radio', options: tones } },
} satisfies Meta<typeof Banner>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Notice: Story = {};
export const Warning: Story = { args: { tone: 'warning' } };
export const Danger: Story = { args: { tone: 'danger' } };
export const Accent: Story = { args: { tone: 'accent' } };
export const Closable: Story = { args: { tone: 'accent', onClose: () => {} } };
export const CloseFocusVisible: Story = {
  ...Closable,
  parameters: { pseudo: { focusVisible: true } },
};

/** Title only, text only, and every tone closable. */
export const Matrix: Story = {
  render: () => {
    const { t } = useT();
    return (
      <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
        {tones.map((tone) => (
          <Texted key={tone} tone={tone} onClose={() => {}} />
        ))}
        <Banner title={t('update.stale')} />
        <Banner tone="warning">{t('errors.photo_expired')}</Banner>
      </div>
    );
  },
};

export const Desktop: Story = {
  ...Matrix,
  globals: { viewport: { value: 'desktop' } },
};
