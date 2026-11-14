import type { Meta, StoryObj } from '@storybook/react-vite';
import { useT } from '../../i18n';
import { Badge } from './Badge';

const tones = ['neutral', 'ok', 'warn', 'err'] as const;

const meta = {
  title: 'UI/Badge',
  component: Badge,
  args: { tone: 'neutral', children: '3' },
  argTypes: { tone: { control: 'inline-radio', options: tones } },
} satisfies Meta<typeof Badge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = {};
export const Ok: Story = { args: { tone: 'ok' } };
export const Warn: Story = { args: { tone: 'warn' } };
export const Err: Story = { args: { tone: 'err' } };

/** Every tone with a number and with a word from the dictionary. */
export const Matrix: Story = {
  render: () => {
    const { t } = useT();
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        {tones.map((tone) => (
          <Badge key={tone} tone={tone}>
            12
          </Badge>
        ))}
        {tones.map((tone) => (
          <Badge key={tone} tone={tone}>
            {t('offline.no_network')}
          </Badge>
        ))}
      </div>
    );
  },
};

export const Desktop: Story = {
  ...Matrix,
  globals: { viewport: { value: 'desktop' } },
};
