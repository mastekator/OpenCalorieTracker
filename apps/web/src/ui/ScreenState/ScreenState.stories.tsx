import type { Meta, StoryObj } from '@storybook/react-vite';
import { CircleAlert, Inbox, Link, WifiOff } from 'lucide-react';
import { useT } from '../../i18n';
import { Button } from '../Button/Button';
import { ScreenState } from './ScreenState';

type Kind = 'empty' | 'error' | 'offline' | 'invalidLink';

// Text comes from the dictionary so the locale toolbar switches RU / EN.
function Example({ kind }: { kind: Kind }) {
  const { t } = useT();
  switch (kind) {
    case 'empty':
      return (
        <ScreenState icon={<Inbox />} title={t('errors.not_found')}>
          {t('errors.ai_not_configured')}
        </ScreenState>
      );
    case 'error':
      return (
        <ScreenState
          icon={<CircleAlert />}
          tone="danger"
          title={t('errors.internal')}
          action={<Button variant="tonal">{t('common.retry')}</Button>}
        />
      );
    case 'offline':
      return (
        <ScreenState
          icon={<WifiOff />}
          title={t('offline.no_network')}
          action={<Button variant="tonal">{t('common.retry')}</Button>}
        >
          {t('offline.server_down')}
        </ScreenState>
      );
    case 'invalidLink':
      return (
        <ScreenState
          icon={<Link />}
          tone="warning"
          title={t('errors.invite_invalid')}
          action={<Button>{t('screens.login')}</Button>}
        >
          {t('errors.invite_expired')}
        </ScreenState>
      );
  }
}

const meta = {
  title: 'UI/ScreenState',
  component: ScreenState,
} satisfies Meta<typeof ScreenState>;
export default meta;
type Story = StoryObj;

export const Empty: Story = { render: () => <Example kind="empty" /> };
export const Error: Story = { render: () => <Example kind="error" /> };
export const OfflineNoCache: Story = {
  render: () => <Example kind="offline" />,
};
export const InvalidLink: Story = {
  render: () => <Example kind="invalidLink" />,
};
export const Desktop: Story = {
  render: () => <Example kind="error" />,
  globals: { viewport: { value: 'desktop' } },
};
