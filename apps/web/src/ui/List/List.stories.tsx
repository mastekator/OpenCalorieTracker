import type { Meta, StoryObj } from '@storybook/react-vite';
import { Globe, KeyRound, LogOut, Mail, Moon, Plus, Users } from 'lucide-react';
import { useT } from '../../i18n';
import { Badge } from '../Badge/Badge';
import { List, ListRow } from './List';

const noop = () => {};

// Sample screen copy (OCT-13 §6–7); not in the dictionary because only stories use it.
const copy = {
  ru: {
    general: 'Общие',
    language: 'Язык',
    theme: 'Тема',
    system: 'Как в системе',
    passkeys: 'Passkeys',
    passkey: 'iPhone',
    created: 'Создан 13 нояб. · использован сегодня',
    addPasskey: 'Добавить passkey на этом устройстве',
    admin: 'Администрирование',
    users: 'Пользователи',
    invites: 'Приглашения',
    adminOffline: 'Администрирование недоступно без сети',
    logout: 'Выйти',
  },
  en: {
    general: 'General',
    language: 'Language',
    theme: 'Theme',
    system: 'System',
    passkeys: 'Passkeys',
    passkey: 'iPhone',
    created: 'Created Nov 13 · used today',
    addPasskey: 'Add a passkey on this device',
    admin: 'Administration',
    users: 'Users',
    invites: 'Invitations',
    adminOffline: 'Administration is unavailable offline',
    logout: 'Sign out',
  },
};

function Settings({ disabled = false }: { disabled?: boolean }) {
  const { locale } = useT();
  const c = copy[locale === 'ru' ? 'ru' : 'en'];
  return (
    <div style={{ display: 'grid', gap: 'var(--section-gap)' }}>
      <List title={c.general}>
        <ListRow
          icon={<Globe />}
          value={locale === 'ru' ? 'Русский' : 'English'}
          onClick={noop}
        >
          {c.language}
        </ListRow>
        <ListRow icon={<Moon />} value={c.system} onClick={noop}>
          {c.theme}
        </ListRow>
      </List>
      <List title={c.passkeys}>
        <ListRow icon={<KeyRound />} description={c.created} onClick={noop}>
          {c.passkey}
        </ListRow>
        <ListRow icon={<Plus />} accent onClick={noop}>
          {c.addPasskey}
        </ListRow>
      </List>
      <List title={c.admin} footer={disabled ? c.adminOffline : undefined}>
        <ListRow icon={<Users />} value="3" disabled={disabled} href="#users">
          {c.users}
        </ListRow>
        <ListRow
          icon={<Mail />}
          value={<Badge tone="warn">2</Badge>}
          disabled={disabled}
          onClick={noop}
        >
          {c.invites}
        </ListRow>
      </List>
      <List>
        <ListRow icon={<LogOut />} danger onClick={noop} chevron={false}>
          {c.logout}
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
