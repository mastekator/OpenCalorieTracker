import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn, within } from 'storybook/test';
import { CookMode } from './CookMode';
import { PILAF } from './fixtures';

const meta = {
  title: 'Screens/Kitchen/CookMode',
  component: CookMode,
  parameters: { layout: 'fullscreen' },
  args: {
    recipe: PILAF,
    online: true,
    awake: true,
    onExit: fn(),
    onSaveWeight: fn(async () => {}),
  },
} satisfies Meta<typeof CookMode>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };
const desktop = { viewport: { value: 'desktop' } };

/** 4.1: step without a photo, the screen is kept on. */
export const StepNoPhoto: Story = {};
export const StepNoPhotoDark: Story = { globals: dark };
export const StepNoPhotoRussian: Story = { globals: { locale: 'ru' } };
/** No Wake Lock in this browser: no «screen stays on» line. */
export const NoWakeLock: Story = { args: { awake: false } };

/** 4.1: step with a photo. */
export const StepWithPhoto: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Next' }));
  },
};
export const StepWithPhotoDark: Story = { ...StepWithPhoto, globals: dark };

/** `list-ordered`: every step in one list; a tap goes to it. */
export const AllSteps: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole('button', { name: 'All steps' }),
    );
  },
};
export const AllStepsDark: Story = { ...AllSteps, globals: dark };

/** 4.2: after the last step, «Done!» with the cooked weight. */
export const Done: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole('button', { name: 'All steps' }),
    );
    await userEvent.click(await body.findByText(PILAF.steps[2]!.text));
    await userEvent.click(await canvas.findByRole('button', { name: 'Done' }));
    await body.findByRole('textbox', { name: 'Cooked weight' });
  },
};
export const DoneDark: Story = { ...Done, globals: dark };
/** A refined weight 3× off the ingredients: warning, Save still works (E-10.2). */
export const DoneWeightWarning: Story = {
  play: async (ctx) => {
    await Done.play!(ctx);
    const body = within(ctx.canvasElement.ownerDocument.body);
    const field = await body.findByRole('textbox', { name: 'Cooked weight' });
    await ctx.userEvent.clear(field);
    await ctx.userEvent.type(field, '500');
  },
};
/** With the portion sheet hooked up (OCT-310): «Log a serving». */
export const DoneWithLog: Story = { ...Done, args: { onLog: fn() } };
/** Offline: the weight is read-only, the footnote says why (E-10.5). */
export const DoneOffline: Story = { ...Done, args: { online: false } };

/** §10: the whole main area, ← / → page, Esc exits. */
export const Desktop: Story = { ...StepWithPhoto, globals: desktop };
export const DesktopDark: Story = {
  ...StepWithPhoto,
  globals: { ...desktop, ...dark },
};
export const DesktopDone: Story = { ...Done, globals: desktop };
