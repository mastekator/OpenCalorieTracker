import type { Meta, StoryObj } from '@storybook/react-vite';
import { Settings2 } from 'lucide-react';
import { useT } from '../../i18n';
import { atPath, useTabs } from '../navStory';
import { Sidebar } from './Sidebar';

function Story(args: Parameters<typeof Sidebar>[0]) {
  const { t } = useT();
  return (
    <Sidebar
      {...args}
      items={useTabs()}
      settings={{
        href: '/settings',
        icon: Settings2,
        label: t('nav.settings'),
      }}
    />
  );
}

const meta = {
  title: 'UI/Sidebar',
  component: Sidebar,
  decorators: [atPath],
  render: (args) => <Story {...args} />,
  args: {
    items: [],
    settings: { href: '/settings', icon: Settings2, label: '' },
    email: 'anna@example.com',
    onAdd: () => {},
  },
  parameters: { layout: 'fullscreen' },
  globals: { viewport: { value: 'desktop' } },
} satisfies Meta<typeof Sidebar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Today: Story = {};
export const Diary: Story = { parameters: { path: '/diary' } };
export const Profile: Story = { parameters: { path: '/profile' } };
/** A nested settings screen keeps Settings current. */
export const Settings: Story = { parameters: { path: '/settings/theme' } };
export const LongEmail: Story = {
  args: { email: 'anastasia.konstantinopolskaya.family@example-household.org' },
};
export const NoEmail: Story = { args: { email: undefined } };
export const Hover: Story = {
  parameters: { pseudo: { hover: ['.sidebar__link'] } },
};
export const FocusVisible: Story = {
  parameters: { pseudo: { focusVisible: ['.sidebar__link', '.button'] } },
};
