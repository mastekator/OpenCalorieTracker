import { useState, type ComponentProps } from 'react';
import { fn } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Clock, ImageOff, WifiOff } from 'lucide-react';
import { Banner } from '../Banner/Banner';
import { RefineBar } from './RefineBar';

type Props = ComponentProps<typeof RefineBar>;

/** Keeps the text like the edit screen does. */
function Demo(props: Props) {
  const [value, setValue] = useState(props.value);
  return <RefineBar {...props} value={value} onChange={setValue} />;
}

const meta = {
  title: 'UI/RefineBar',
  component: Demo,
  decorators: (Story) => (
    <div style={{ maxWidth: 390, padding: 16 }}>
      <Story />
    </div>
  ),
  args: {
    value: '',
    onChange: fn(),
    onRefine: fn(),
    onAgain: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };
const text = 'there’s chicken in the noodles, about 80 g';

/** A.1: one line; the buttons show on focus or with text. */
export const Idle: Story = {};
export const IdleDark: Story = { globals: dark };
/** A.3: typed or dictated; «Refine» is the main action. */
export const Typed: Story = { args: { value: text } };
export const TypedDark: Story = { args: { value: text }, globals: dark };
/** A.3: the counter from 250 characters on. */
const long = { value: 'a'.repeat(262) };
export const Counter: Story = { args: long };
export const CounterDark: Story = { args: long, globals: dark };
/** D.11 / C.3: no photo — «What did you eat», no «Recognize again». */
const textOnly = { textOnly: true, onAgain: undefined };
export const TextOnly: Story = { args: textOnly };
export const TextOnlyDark: Story = { args: textOnly, globals: dark };
/** B: the request runs; the list above is locked. */
export const Busy: Story = { args: { busy: 'busy' } };
export const BusyDark: Story = { args: { busy: 'busy' }, globals: dark };
/** B: after 10 s. */
export const Slow: Story = { args: { busy: 'slow' } };
export const SlowDark: Story = { args: { busy: 'slow' }, globals: dark };
/** D.3: offline — text stays, the buttons wait. */
const offline = {
  value: text,
  disabled: true,
  note: (
    <>
      <WifiOff aria-hidden="true" />
      Needs a connection
    </>
  ),
} satisfies Partial<Props>;
export const Offline: Story = { args: offline };
export const OfflineDark: Story = { args: offline, globals: dark };
/** D.4: the photo is still in the offline queue. */
const queued = {
  disabled: true,
  onAgain: undefined,
  note: (
    <>
      <Clock aria-hidden="true" />
      The photo isn’t sent yet — you can refine with text once you’re online
    </>
  ),
} satisfies Partial<Props>;
export const Queued: Story = { args: queued };
export const QueuedDark: Story = { args: queued, globals: dark };
/** D.10: the photo is gone — text only. */
const gone = {
  onAgain: undefined,
  note: (
    <>
      <ImageOff aria-hidden="true" />
      The photo is no longer stored
    </>
  ),
} satisfies Partial<Props>;
export const PhotoGone: Story = { args: gone };
export const PhotoGoneDark: Story = { args: gone, globals: dark };
/** D.5: unavailable or timed out — «Try again». */
const unavailable = {
  value: text,
  error: (
    <Banner
      tone="danger"
      title="AI is unavailable right now"
      actions={<button type="button">Try again</button>}
    >
      The list is unchanged. Try again later or edit by hand.
    </Banner>
  ),
} satisfies Partial<Props>;
export const Unavailable: Story = { args: unavailable };
export const UnavailableDark: Story = { args: unavailable, globals: dark };
/** D.6: the provider's quota (429). */
const quota = {
  value: text,
  error: (
    <Banner tone="warning" title="AI request limit reached. Try again later">
      The list is unchanged.
    </Banner>
  ),
} satisfies Partial<Props>;
export const Quota: Story = { args: quota };
export const QuotaDark: Story = { args: quota, globals: dark };
/** D.7: invalid answer after the retry. */
const invalid = {
  value: text,
  error: (
    <Banner
      tone="warning"
      title="Couldn’t refine — try wording it differently"
    />
  ),
} satisfies Partial<Props>;
export const Invalid: Story = { args: invalid };
export const InvalidDark: Story = { args: invalid, globals: dark };
/** D.8: the AI removed every dish. */
const empty = {
  value: text,
  error: (
    <Banner
      tone="warning"
      title="AI removed every dish — the list is unchanged"
    />
  ),
} satisfies Partial<Props>;
export const Empty: Story = { args: empty };
export const EmptyDark: Story = { args: empty, globals: dark };
/** C.1 / C.2: the list was updated — the kcal shift, «Removed», «Undo». */
const result = {
  result: { kcalDelta: -115, removed: ['Baked sweet potato'], onUndo: fn() },
} satisfies Partial<Props>;
export const Result: Story = { args: result };
export const ResultDark: Story = { args: result, globals: dark };
const added = {
  result: { kcalDelta: 48, removed: [], onUndo: fn() },
} satisfies Partial<Props>;
export const ResultAdded: Story = { args: added };
export const ResultAddedDark: Story = { args: added, globals: dark };
