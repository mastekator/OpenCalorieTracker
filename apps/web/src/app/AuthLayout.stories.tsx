import type { Meta, StoryObj } from '@storybook/react-vite';
import { useT } from '../i18n';
import { Button } from '../ui/Button/Button';
import { Field } from '../ui/Field/Field';
import { AuthLayout } from './AuthLayout';

// A sign-in-like form to show the card; the real screen is App/LoginScreen.
function Form() {
  const { t } = useT();
  return (
    <form style={{ display: 'grid', gap: 'var(--space-4)' }}>
      <h1>{t('screens.login')}</h1>
      <Field label={t('auth.email')} placeholder={t('auth.email_ph')} />
      <Field label={t('auth.password')} type="password" />
      <Button type="submit">{t('screens.login')}</Button>
    </form>
  );
}

const meta = {
  title: 'App/AuthLayout',
  component: AuthLayout,
  render: () => (
    <AuthLayout>
      <Form />
    </AuthLayout>
  ),
  args: { children: null },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof AuthLayout>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Phone: a plain page, no card. */
export const Phone: Story = {};
/** From 1024px: a centred card on the page background. */
export const Desktop: Story = { globals: { viewport: { value: 'desktop' } } };
