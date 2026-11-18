import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { CopySheet } from './CopySheet';

/** 5.2 Copying refused on http: the row is already selected. */
const meta = {
  title: 'UI/CopySheet',
  component: CopySheet,
  args: {
    text: '| google | gemini-3.5-flash-lite | 8/9 | 2026-11-18 | 3.8 s/photo; OCT v0.2.0, prompt 3 |',
    title: 'Row for MODELS.md',
    onClose: fn(),
  },
} satisfies Meta<typeof CopySheet>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Row: Story = {};
export const RowDark: Story = { globals: { theme: 'dark' } };
