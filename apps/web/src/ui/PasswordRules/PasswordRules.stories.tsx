import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useT } from '../../i18n';
import { Field } from '../Field/Field';
import { PasswordRules } from './PasswordRules';

const meta = {
  title: 'UI/PasswordRules',
  component: PasswordRules,
  args: { password: '', attempted: false },
} satisfies Meta<typeof PasswordRules>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const Partly: Story = { args: { password: 'pasta2' } };
export const AllMet: Story = { args: { password: 'Pasta-2-go' } };
export const FailedAttempt: Story = {
  args: { password: 'pasta2', attempted: true },
};
export const WithEmail: Story = {
  args: { password: 'Pasta-2-go', email: 'me@example.com' },
};
export const SameAsEmail: Story = {
  args: {
    password: 'Me1@example.com',
    email: 'me1@example.com',
    attempted: true,
  },
};

/** Under a password field, as on the invite screen: type to see the rules update. */
export const UnderField: Story = {
  render: function Render() {
    const { t } = useT();
    const [password, setPassword] = useState('');
    return (
      <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
        <Field
          label={t('auth.password')}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <PasswordRules password={password} email="me@example.com" />
      </div>
    );
  },
};
