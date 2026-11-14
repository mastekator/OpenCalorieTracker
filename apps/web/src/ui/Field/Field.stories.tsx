import type { Meta, StoryObj } from '@storybook/react-vite';
import { useT } from '../../i18n';
import { Field } from './Field';

type Args = Parameters<typeof Field>[0];

// Texts come from the dictionary so the locale toolbar switches RU / EN.
function Localized(args: Args) {
  const { t } = useT();
  const password = args.type === 'password';
  return (
    <Field
      {...args}
      label={password ? t('auth.password') : t('auth.email')}
      placeholder={password ? undefined : t('auth.email_ph')}
      hint={args.hint && t('update.stale')}
      error={
        args.error &&
        (password ? t('errors.password_invalid') : t('form.err.email'))
      }
    />
  );
}

const meta = {
  title: 'UI/Field',
  component: Field,
  render: (args) => <Localized {...args} />,
  args: { label: 'Label', placeholder: '' },
} satisfies Meta<typeof Field>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithHint: Story = { args: { hint: 'hint' } };
export const WithValue: Story = { args: { defaultValue: 'me@example.com' } };
export const Focused: Story = {
  args: { hint: 'hint' },
  parameters: { pseudo: { focusWithin: true } },
};
export const Error: Story = {
  args: { hint: 'hint', error: 'error', defaultValue: 'me@example' },
};
export const Disabled: Story = {
  args: { disabled: true, defaultValue: 'me@example.com' },
};
export const Locked: Story = {
  args: { locked: true, defaultValue: 'me@example.com' },
};
export const Password: Story = {
  args: { type: 'password', defaultValue: 'Pasta-2-go' },
};
export const PasswordError: Story = {
  args: { type: 'password', defaultValue: 'pasta', error: 'error' },
};
export const PasswordDisabled: Story = {
  args: { type: 'password', defaultValue: 'Pasta-2-go', disabled: true },
};
export const ActionHover: Story = {
  args: { type: 'password', defaultValue: 'Pasta-2-go' },
  parameters: { pseudo: { hover: ['.field__action'] } },
};

/** Every state in one column (iPhone SE: long RU texts wrap). */
export const Matrix: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 'var(--space-5)' }}>
      <Localized label="" />
      <Localized label="" hint="hint" defaultValue="me@example.com" />
      <Localized label="" hint="hint" error="error" defaultValue="me@example" />
      <Localized label="" disabled defaultValue="me@example.com" />
      <Localized label="" locked defaultValue="me@example.com" />
      <Localized label="" type="password" defaultValue="Pasta-2-go" />
      <Localized label="" type="password" error="error" defaultValue="pasta" />
    </div>
  ),
};
