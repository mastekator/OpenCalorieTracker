import type { Meta, StoryObj } from '@storybook/react-vite';
import { atPath, useTabs } from '../navStory';
import { TabBar } from './TabBar';

const meta = {
  title: 'UI/TabBar',
  component: TabBar,
  decorators: [atPath],
  render: (args) => <TabBar {...args} items={useTabs()} />,
  args: { items: [], onAdd: () => {} },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof TabBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Today: Story = {};
export const Diary: Story = { parameters: { path: '/diary' } };
export const Week: Story = { parameters: { path: '/week' } };
export const Profile: Story = { parameters: { path: '/profile' } };
/** Nested screen: its root tab stays current. */
export const NestedUnderProfile: Story = {
  parameters: { path: '/profile/norm' },
};
export const CameraPressed: Story = {
  parameters: { pseudo: { active: ['.tabbar__camera'] } },
};
export const Hover: Story = {
  parameters: { pseudo: { hover: ['.tabbar__tab', '.tabbar__camera'] } },
};
export const FocusVisible: Story = {
  parameters: { pseudo: { focusVisible: ['.tabbar__tab', '.tabbar__camera'] } },
};
/** iPhone SE: the narrowest supported width. */
export const Narrow: Story = { globals: { viewport: { value: 'iphoneSE' } } };
/** Wide window: the tabs stay in a phone-wide column (layout.css shows Sidebar here instead). */
export const Desktop: Story = { globals: { viewport: { value: 'desktop' } } };
