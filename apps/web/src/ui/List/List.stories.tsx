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
    invite: 'Пригласить',
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
    invite: 'Invite',
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
          action={
            <button
              type="button"
              className="list-row__action"
              aria-label={c.invite}
              disabled={disabled}
              onClick={noop}
            >
              <Plus aria-hidden="true" />
            </button>
          }
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
/** descriptionNowrap: a long description stays on one line with an ellipsis. */
export const DescriptionNowrap: Story = {
  render: () => (
    <List>
      <ListRow
        icon={<KeyRound />}
        description="Created Nov 13 · used today · synced on three devices"
        descriptionNowrap
        value="80.5 kg"
        onClick={noop}
      >
        iPhone
      </ListRow>
    </List>
  ),
  globals: { viewport: { value: 'iphoneSE' } },
};
export const DescriptionNowrapDark: Story = {
  ...DescriptionNowrap,
  globals: { ...DescriptionNowrap.globals, theme: 'dark' },
};
export const Desktop: Story = {
  globals: { viewport: { value: 'desktop' } },
};
/** current: the item being worked on, e.g. the step in cooking mode. */
export const Current: Story = {
  render: () => (
    <List>
      {['Fry the onion', 'Add the rice', 'Simmer 20 minutes'].map((text, k) => (
        <ListRow
          key={k}
          chevron={false}
          current={k === 1 ? 'step' : undefined}
          description={`Step ${k + 1} of 3${k === 1 ? ' · now' : ''}`}
          onClick={noop}
        >
          {text}
        </ListRow>
      ))}
    </List>
  ),
};
export const CurrentDark: Story = { ...Current, globals: { theme: 'dark' } };
/** A danger text action under the row: «Turn off» on an integration card (OCT-187 1.2). */
export const ActionBelow: Story = {
  render: function Render() {
    const { t } = useT();
    return (
      <List>
        {[false, true].map((disabled) => (
          <ListRow
            key={String(disabled)}
            icon={<KeyRound />}
            description={t('integr.status.on')}
            onClick={noop}
            action={
              <button
                type="button"
                className="list-row__action list-row__action--danger list-row__action--below"
                disabled={disabled}
                onClick={noop}
              >
                {t('integr.turn_off')}
              </button>
            }
          >
            {t('integr.tokens.title')}
          </ListRow>
        ))}
      </List>
    );
  },
};
export const ActionBelowDark: Story = {
  ...ActionBelow,
  globals: { theme: 'dark' },
};
