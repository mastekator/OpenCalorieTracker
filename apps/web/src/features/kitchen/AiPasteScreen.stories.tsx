import type { Meta, StoryObj } from '@storybook/react-vite';
import { fireEvent, fn } from 'storybook/test';
import { AiPasteView } from './AiPasteScreen';

const meta = {
  title: 'Screens/Kitchen/AiPasteScreen',
  component: AiPasteView,
  parameters: { layout: 'fullscreen' },
  args: {
    online: true,
    parse: fn(() => new Promise<never>(() => {})),
    onParsed: fn(),
    onManual: fn(),
  },
} satisfies Meta<typeof AiPasteView>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };
const TEXT =
  'Pilaf. Rice 400 g, pork 500 g, carrots 300 g, onions 2, oil 100 ml, garlic, salt to taste. Fry the meat, add the vegetables, then the rice and water; simmer 40 minutes.';

const typed: Story['play'] = async ({ canvas }) => {
  fireEvent.change(await canvas.findByRole('textbox'), {
    target: { value: TEXT },
  });
};
const parsed: Story['play'] = async (ctx) => {
  await typed(ctx);
  fireEvent.click(ctx.canvas.getByRole('button', { name: /Parse|Разобрать/ }));
};

/** 7.1: empty — «Parse» is disabled. */
export const Empty: Story = {};
export const EmptyDark: Story = { globals: dark };
/** 7.1: text pasted, the counter follows. */
export const Typed: Story = { play: typed };
export const TypedDark: Story = { play: typed, globals: dark };
export const TypedRussian: Story = { play: typed, globals: { locale: 'ru' } };
/** «Parsing the recipe…» while the provider works. */
export const Loading: Story = { play: parsed };
export const LoadingDark: Story = { play: parsed, globals: dark };
/** E-10.6: the provider failed — the text stays, «Try again / Fill in manually». */
export const Error: Story = {
  args: { parse: fn(async () => Promise.reject(new globalThis.Error())) },
  play: parsed,
};
export const ErrorDark: Story = { ...Error, globals: dark };
/** Offline «Parse» is disabled; the app's offline bar says why. */
export const Offline: Story = { args: { online: false }, play: typed };
