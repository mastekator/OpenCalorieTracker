import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../Button/Button';
import { Splash } from './Splash';

// Story-only overrides of the root token: slow motion, or a final frame held for an hour
// (1 ms short of the end: at the very end animationend fires and the splash goes).
const SLOW = ':root { --duration-splash: 4000ms; }';
const FINAL = `:root { --duration-splash: 3600000ms; }
.splash, .splash * { animation-delay: calc(1ms - var(--duration-splash)) !important; animation-play-state: paused !important; }`;

/** Plays over the app on load, then unmounts; «Play again» mounts it anew. A tap skips it. */
function Demo({ css }: { css?: string }) {
  const [run, setRun] = useState(0);
  return (
    <>
      {css && <style>{css}</style>}
      <Button onClick={() => setRun(run + 1)}>Play again</Button>
      <Splash key={run} />
    </>
  );
}

/** Launch intro (OCT-217): the pod opens, peas pop out, then the name. Reduce motion: the final frame at once. */
const meta = {
  title: 'UI/Splash',
  component: Splash,
  parameters: { layout: 'fullscreen' },
  render: () => <Demo />,
} satisfies Meta<typeof Splash>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playing: Story = {};
export const PlayingDark: Story = { globals: { theme: 'dark' } };
export const SlowMotion: Story = { render: () => <Demo css={SLOW} /> };
export const Final: Story = {
  globals: { theme: 'light' },
  render: () => <Demo css={FINAL} />,
};
export const FinalDark: Story = {
  globals: { theme: 'dark' },
  render: () => <Demo css={FINAL} />,
};
