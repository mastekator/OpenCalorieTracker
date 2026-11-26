import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { ConsentSheet } from './ConsentSheet';

/** OCT-178 §2: asked before the user's data first goes to an AI provider. */
const meta = {
  title: 'UI/ConsentSheet',
  component: ConsentSheet,
  args: {
    open: true,
    what: 'photo',
    details: { providerKey: 'google', provider: 'google', aiSource: 'server' },
    onAllow: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof ConsentSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

const openai = {
  providerKey: 'openai',
  provider: 'openai',
  aiSource: 'server',
} as const;

/** 2.1: first photo, Gemini: the free tier warning. */
export const Photo: Story = {};
export const PhotoDark: Story = { globals: { theme: 'dark' } };
/** 2.3: the goal chat. */
export const Agent: Story = { args: { what: 'agent', details: openai } };
export const AgentDark: Story = {
  args: { what: 'agent', details: openai },
  globals: { theme: 'dark' },
};
/** «Refine», recipe paste, «Lighter». */
export const Text: Story = { args: { what: 'text', details: openai } };
export const TextDark: Story = {
  args: { what: 'text', details: openai },
  globals: { theme: 'dark' },
};
/** OpenAI-compatible: the host instead of a name, no policy link. */
const compatible = {
  providerKey: 'openai-compatible:llm.example.com',
  provider: 'openai-compatible',
  host: 'llm.example.com',
  aiSource: 'server',
} as const;
export const Compatible: Story = { args: { details: compatible } };
export const CompatibleDark: Story = {
  args: { details: compatible },
  globals: { theme: 'dark' },
};
export const Saving: Story = { args: { busy: true, details: openai } };
export const SavingDark: Story = {
  args: { busy: true, details: openai },
  globals: { theme: 'dark' },
};
/** 5.2: a centered dialog on the desktop. */
export const Desktop: Story = { globals: { viewport: { value: 'desktop' } } };
export const DesktopDark: Story = {
  globals: { viewport: { value: 'desktop' }, theme: 'dark' },
};
