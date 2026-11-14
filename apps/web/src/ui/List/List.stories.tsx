import type { Meta, StoryObj } from '@storybook/react-vite';
import { Globe, LogOut, Moon, Shield, Users } from 'lucide-react';
import { useT } from '../../i18n';
import { Badge } from '../Badge/Badge';
import { List, ListRow } from './List';

const noop = () => {};

// Labels come from the dictionary so the locale toolbar switches RU / EN.
function Settings({ disabled = false }: { disabled?: boolean }) {
  const { t } = useT();
  return (
    <div style={{ display: 'grid', gap: 'var(--section-gap)' }}>
      <List title={t('common.appName')}>
        <ListRow icon={<Globe />} value="English" onClick={noop}>
          {t('screens.home')}
        </ListRow>
        <ListRow icon={<Moon />} value={t('common.loading')} onClick={noop}>
          {t('screens.login')}
        </ListRow>
        <ListRow>{t('common.appName')}</ListRow>
      </List>
      <List
        title={t('screens.invite')}
        footer={disabled ? t('offline.no_network') : undefined}
      >
        <ListRow icon={<Users />} disabled={disabled} href="#invites">
          {t('screens.invite')}
        </ListRow>
        <ListRow
          icon={<Shield />}
          value={<Badge tone="err">2</Badge>}
          disabled={disabled}
          onClick={noop}
        >
          {t('errors.device_blocked')}
        </ListRow>
      </List>
      <List>
        <ListRow icon={<LogOut />} danger onClick={noop} chevron={false}>
          {t('common.close')}
        </ListRow>
      </List>
    </div>
  );
}

const meta = {
  title: 'UI/List',
  component: List,
  render: () => <Settings />,
} satisfies Meta<typeof List>;
export default meta;
type Story = StoryObj;

export const Default: Story = {};
export const Disabled: Story = { render: () => <Settings disabled /> };
export const Hover: Story = { parameters: { pseudo: { hover: true } } };
export const Pressed: Story = { parameters: { pseudo: { active: true } } };
export const FocusVisible: Story = {
  parameters: { pseudo: { focusVisible: true } },
};
export const Desktop: Story = {
  globals: { viewport: { value: 'desktop' } },
};
