import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { ConsentsList } from './ConsentsList';

const DAY = 86_400_000;
const server = {
  providerKey: 'google',
  provider: 'google' as const,
  host: null,
  local: false,
};

/** Settings → AI consents, OCT-178 1.1, 1.9, 5.1. Theme and language: toolbar. */
const meta = {
  title: 'UI/ConsentsList',
  component: ConsentsList,
  args: {
    consents: [{ providerKey: 'google', grantedAt: Date.now() - 20 * DAY }],
    server,
    onRevoke: fn(),
  },
} satisfies Meta<typeof ConsentsList>;
export default meta;
type Story = StoryObj<typeof meta>;
const dark = { globals: { theme: 'dark' } };

/** 1.1: one consent, through the server. */
export const Default: Story = {};
export const DefaultDark: Story = { ...Default, ...dark };

/** 5.1: several, an OpenAI-compatible host, and the server's local model without «Revoke». */
export const Several: Story = {
  args: {
    consents: [
      { providerKey: 'openai', grantedAt: Date.now() - 40 * DAY },
      {
        providerKey: 'openai-compatible:llm.example.com',
        grantedAt: Date.now() - 3 * DAY,
      },
    ],
    server: {
      providerKey: 'openai-compatible:192.168.1.20',
      provider: 'openai-compatible',
      host: '192.168.1.20',
      local: true,
    },
  },
};
export const SeveralDark: Story = { ...Several, ...dark };

/** 1.12: nothing allowed yet. */
export const Empty: Story = { args: { consents: [], server } };
export const EmptyDark: Story = { ...Empty, ...dark };
