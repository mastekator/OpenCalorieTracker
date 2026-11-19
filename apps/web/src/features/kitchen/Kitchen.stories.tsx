import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useT } from '../../i18n';
import { NavBar } from '../../ui/NavBar/NavBar';
import { KitchenView } from './KitchenScreen';
import { RECIPES } from './fixtures';

function InScreen({ children }: { children: ReactNode }) {
  const { t } = useT();
  return (
    <div className="screen screen--wide">
      <NavBar
        large
        title={t('kitchen.title')}
        back={{ href: '/profile', label: t('nav.profile'), mobileOnly: true }}
      />
      <main className="screen__body">{children}</main>
    </div>
  );
}

const meta = {
  title: 'Screens/Kitchen/KitchenScreen',
  component: KitchenView,
  decorators: [(Story) => <InScreen>{Story()}</InScreen>],
  parameters: { layout: 'fullscreen' },
  args: { recipes: RECIPES },
} satisfies Meta<typeof KitchenView>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };
const desktop = { viewport: { value: 'desktop' } };

/** 1.2: photo or illustration, kcal per 100 g and per serving, recently logged first. */
export const List: Story = {};
export const ListDark: Story = { globals: dark };
export const ListRussian: Story = { globals: { locale: 'ru' } };
export const ListDesktop: Story = { globals: desktop };
/** 1.4, wave 1: no «New recipe» yet, it comes with the editor. */
export const Empty: Story = { args: { recipes: [] } };
export const EmptyDark: Story = { args: { recipes: [] }, globals: dark };
