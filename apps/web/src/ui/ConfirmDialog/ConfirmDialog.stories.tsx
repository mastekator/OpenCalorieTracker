import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useT } from '../../i18n';
import { Button } from '../Button/Button';
import { ConfirmDialog } from './ConfirmDialog';

type Props = {
  tone?: 'danger' | 'primary';
  body?: boolean;
  close?: boolean;
  leave?: boolean;
  switchUser?: boolean;
  stack?: boolean;
};

function Demo({
  tone = 'danger',
  body = true,
  close = false,
  leave = false,
  switchUser = false,
  stack = false,
}: Props) {
  const { t } = useT();
  const [open, setOpen] = useState(true);
  if (switchUser)
    return (
      <ConfirmDialog
        open={open}
        title={t('switch_user.title')}
        body={t('switch_user.body', { count: 3, email: 'anna@example.com' })}
        confirmLabel={t('switch_user.ok')}
        onConfirm={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      />
    );
  if (leave)
    return (
      <>
        <Button variant="tonal" onClick={() => setOpen(true)}>
          {t('nav.today')}
        </Button>
        <ConfirmDialog
          open={open}
          tone="primary"
          title={t('leave.title')}
          body={t('leave.body')}
          confirmLabel={t('leave.save')}
          secondaryLabel={t('leave.discard')}
          cancelLabel={t('leave.stay')}
          onConfirm={() => setOpen(false)}
          onSecondary={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      </>
    );
  return (
    <>
      <Button variant="danger-plain" onClick={() => setOpen(true)}>
        {t('settings.logout')}
      </Button>
      <ConfirmDialog
        open={open}
        tone={tone}
        title={t('logout.confirm.title')}
        body={body ? t('logout.confirm.body_unsaved') : undefined}
        confirmLabel={t('settings.logout')}
        cancelLabel={close ? t('common.close') : undefined}
        stack={stack}
        onConfirm={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}

const meta = { title: 'UI/ConfirmDialog', component: Demo } satisfies Meta<
  typeof Demo
>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Danger: Story = {};
export const Primary: Story = { args: { tone: 'primary' } };
export const CloseLabel: Story = { args: { tone: 'primary', close: true } };
export const TitleOnly: Story = { args: { body: false } };
/** Three buttons: leave with edits (OCT-22 8.16); focus on «Stay». */
export const LeaveWithEdits: Story = { args: { leave: true } };
export const LeaveWithEditsDark: Story = {
  args: { leave: true },
  globals: { theme: 'dark' },
};
export const LeaveWithEditsRussian: Story = {
  args: { leave: true },
  globals: { locale: 'ru' },
};
export const Stacked: Story = { args: { tone: 'primary', stack: true } };
export const StackedDark: Story = {
  args: { tone: 'primary', stack: true },
  globals: { theme: 'dark' },
};
export const Dark: Story = { globals: { theme: 'dark' } };
export const Russian: Story = { globals: { locale: 'ru' } };
export const Desktop: Story = { globals: { viewport: { value: 'desktop' } } };
export const DesktopDark: Story = {
  globals: { viewport: { value: 'desktop' }, theme: 'dark' },
};
/** Another account signs in while the previous one has unsent changes (OCT-25 3.8). */
export const SwitchUser: Story = { args: { switchUser: true } };
export const SwitchUserDark: Story = {
  args: { switchUser: true },
  globals: { theme: 'dark' },
};
export const SwitchUserRussian: Story = {
  args: { switchUser: true },
  globals: { locale: 'ru' },
};
