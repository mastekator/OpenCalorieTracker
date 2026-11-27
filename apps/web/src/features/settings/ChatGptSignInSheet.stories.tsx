import type { Meta, StoryObj } from '@storybook/react-vite';
import { within } from 'storybook/test';
import { tr } from '../../../.storybook/tr';
import { ChatGptSignInSheet } from './ChatGptSignInSheet';

const START =
  'https://auth.openai.com/api/accounts/authorize?response_type=code&state=s1';

/** POST …/chatgpt/start answers the address, or 500 with `failStart`. */
const serve =
  (failStart = false) =>
  () => {
    const real = globalThis.fetch;
    globalThis.fetch = async () =>
      failStart
        ? Response.json(
            { error: { code: 'internal', message: '' } },
            { status: 500 },
          )
        : Response.json({ url: START });
    return () => {
      globalThis.fetch = real;
    };
  };

/** ADR-0031 §4, OCT-178 3.3: three steps and the pasted address. */
const meta = {
  title: 'Settings/ChatGptSignInSheet',
  component: ChatGptSignInSheet,
  args: { open: true, onClose: () => {}, onDone: () => {} },
  beforeEach: serve(),
} satisfies Meta<typeof ChatGptSignInSheet>;
export default meta;
type Story = StoryObj<typeof meta>;
const dark = { globals: { theme: 'dark' } };

export const Default: Story = {};
export const DefaultDark: Story = { ...dark };

/** Something that is not the callback address: the error under the field, no request. */
export const WrongAddress: Story = {
  play: async ({ canvasElement, globals, userEvent }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await canvas.findByRole('link', { name: tr(globals, 'ai.chatgpt.open') });
    await userEvent.type(
      canvas.getByLabelText(tr(globals, 'ai.chatgpt.field')),
      'https://chatgpt.com/',
    );
    await userEvent.click(
      canvas.getByRole('button', { name: tr(globals, 'ai.chatgpt.connect') }),
    );
  },
};
export const WrongAddressDark: Story = { ...WrongAddress, ...dark };

/** The sign-in address did not come: the reason and «Try again» in step 1. */
export const StartFailed: Story = { beforeEach: serve(true) };
export const StartFailedDark: Story = { ...StartFailed, ...dark };
