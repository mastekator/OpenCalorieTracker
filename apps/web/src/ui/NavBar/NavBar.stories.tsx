import type { Meta, StoryObj } from '@storybook/react-vite';
import { Settings2, UserPlus } from 'lucide-react';
import { useT } from '../../i18n';
import { atPath } from '../navStory';
import { NavBar } from './NavBar';

type Args = Parameters<typeof NavBar>[0];

const meta = {
  title: 'UI/NavBar',
  component: NavBar,
  decorators: [atPath],
  args: { title: '' },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof NavBar>;
export default meta;
type Story = StoryObj<typeof meta>;

// Texts come from the dictionary so the locale toolbar switches RU / EN.
function Localised({
  make,
}: {
  make: (t: ReturnType<typeof useT>['t']) => Args;
}) {
  const { t } = useT();
  return <NavBar {...make(t)} />;
}

/** Root screen: large title, action on the right (Profile → Settings). */
export const Root: Story = {
  render: () => (
    <Localised
      make={(t) => ({
        title: t('nav.profile'),
        large: true,
        action: {
          icon: Settings2,
          label: t('nav.settings'),
          href: '/settings',
        },
      })}
    />
  ),
};

/** Root screen with a text action (Diary → «Today», OCT-19 6.1). */
export const TextAction: Story = {
  render: () => (
    <Localised
      make={(t) => ({
        title: t('nav.diary'),
        large: true,
        action: { label: t('diary.today_btn'), onClick: () => {} },
      })}
    />
  ),
};
export const TextActionDark: Story = {
  ...TextAction,
  globals: { theme: 'dark' },
};
export const TextActionDesktop: Story = {
  ...TextAction,
  globals: { viewport: { value: 'desktop' } },
};

/** Nested screen: back to the previous screen, centred title. */
export const Nested: Story = {
  render: () => (
    <Localised
      make={(t) => ({
        title: t('screens.invite'),
        back: { href: '/settings', label: t('nav.settings') },
        action: {
          icon: UserPlus,
          label: t('screens.invite'),
          onClick: () => {},
        },
      })}
    />
  ),
};

export const TitleOnly: Story = {
  render: () => <Localised make={(t) => ({ title: t('nav.settings') })} />,
};

/** Long title and back label are cut with an ellipsis; the title stays centred. */
export const LongTexts: Story = {
  render: () => (
    <Localised
      make={(t) => ({
        title: t('errors.ai_not_configured'),
        back: { href: '/', label: t('screens.recover') },
        action: {
          icon: Settings2,
          label: t('nav.settings'),
          onClick: () => {},
        },
      })}
    />
  ),
};

export const Hover: Story = {
  ...Nested,
  parameters: { pseudo: { hover: ['.navbar__back', '.navbar__action'] } },
};
export const FocusVisible: Story = {
  ...Nested,
  parameters: {
    pseudo: { focusVisible: ['.navbar__back', '.navbar__action'] },
  },
};
export const Desktop: Story = {
  ...Root,
  globals: { viewport: { value: 'desktop' } },
};
