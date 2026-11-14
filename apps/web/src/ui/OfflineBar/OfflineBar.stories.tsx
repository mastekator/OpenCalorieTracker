import type { Meta, StoryObj } from '@storybook/react-vite';
import { OfflineBar } from './OfflineBar';

// Stories force navigator.onLine; the real bar follows the browser's online/offline events.
const offline = (online: boolean) => () => {
  const saved = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => online,
  });
  return () => {
    delete (navigator as { onLine?: boolean }).onLine;
    if (saved) Object.defineProperty(Navigator.prototype, 'onLine', saved);
  };
};

const meta = {
  title: 'UI/OfflineBar',
  component: OfflineBar,
  beforeEach: offline(false),
} satisfies Meta<typeof OfflineBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const OfflineWithData: Story = { args: { dataTime: '12:40' } };
export const NoNetwork: Story = {};
export const ServerDown: Story = {
  args: { serverDown: true },
  beforeEach: offline(true),
};
/** Online and the server answers: the bar renders nothing. */
export const Online: Story = { beforeEach: offline(true) };
export const Desktop: Story = {
  args: { dataTime: '12:40' },
  globals: { viewport: { value: 'desktop' } },
};
