import type { Meta, StoryObj } from '@storybook/react-vite';
import { DataContext } from '../../data/DataContext';
import type { Db, Op } from '../../data/db';
import { entry } from './fixtures';
import { WaterDaySheet } from './WaterDaySheet';

const at = (hhmm: string) => `2026-11-14T${hhmm}:00`;
const water = {
  drinkKey: 'water',
  illustration: 'drinks-water',
  kcal: 0,
} as const;
const latte = {
  drinkKey: 'coffee_milk',
  illustration: 'coffee',
  kcal: 75,
} as const;
const ENTRIES = [
  entry({ ...water, clientId: 'w1', takenAt: at('12:00') }),
  entry({ ...water, clientId: 'w2', takenAt: at('10:30') }),
  entry({ ...latte, clientId: 'l1', takenAt: at('08:15') }),
] as const;
const OFFLINE = [
  entry({ ...water, clientId: 'q1', takenAt: at('14:40') }),
  entry({ ...latte, clientId: 'q2', takenAt: at('13:30') }),
  ...ENTRIES,
];

// Not sent yet: what the sheet reads from the outbox for «waiting to sync».
const QUEUED = new Set(['drink:q1', 'drink:q2']);
const stubDb = {
  getAllFromIndex: async (_store: string, _index: string, id: string) =>
    QUEUED.has(id) ? [{ kind: 'createDrinkEntry' } as Partial<Op>] : [],
} as unknown as Db;

const meta = {
  title: 'Screens/Water/WaterDaySheet',
  component: WaterDaySheet,
  decorators: [(Story) => <DataContext value={stubDb}>{Story()}</DataContext>],
  args: {
    open: true,
    onClose: () => {},
    entries: ENTRIES,
    ml: 500,
    goalMl: 2000,
    units: 'metric',
    online: true,
    onDelete: () => {},
  },
} satisfies Meta<typeof WaterDaySheet>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' };

/** 2.3: newest first, a trash on every row, no edit. */
export const Online: Story = {};
export const OnlineDark: Story = { globals: dark };
export const OnlineRussian: Story = { globals: { locale: 'ru' } };
/** 2.4: unsent ones carry «waiting to sync» and can go; sent ones wait for the network. */
export const Offline: Story = {
  args: { entries: OFFLINE, ml: 1000, online: false },
};
export const OfflineDark: Story = { ...Offline, globals: dark };
export const Empty: Story = { args: { entries: [], ml: 0 } };
/** A past day from the diary: its date in the title. */
export const PastDay: Story = { args: { day: '2026-11-12' } };
export const PastDayEmpty: Story = {
  args: { day: '2026-11-12', entries: [], ml: 0 },
};
export const PastDayDark: Story = { ...PastDay, globals: dark };
