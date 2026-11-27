import type { Meta, StoryObj } from '@storybook/react-vite';
import type { AccountSettings, Drink, MeResponse } from '@oct/shared';
import { DataProvider } from '../../data/DataContext';
import { openUserDb } from '../../data/db';
import { ToastProvider } from '../../ui/Toast/Toast';
import { UndoDeleteProvider } from '../diary/undoDelete';
import { DrinksScreen } from './DrinksScreen';

const user = { id: 31, role: 'user', locale: 'en' } as MeResponse;
const own: Drink[] = [
  {
    id: 1,
    name: 'My latte',
    illustration: 'coffee',
    kcal: 62,
    proteinG: 3,
    fatG: 3.2,
    carbsG: 5,
    countsWater: true,
    deleted: false,
  },
  {
    id: 2,
    name: 'Beer',
    illustration: 'drinks',
    kcal: 43,
    proteinG: 0.5,
    fatG: 0,
    carbsG: 3.6,
    countsWater: false,
    deleted: false,
  },
];

/** Puts the settings (soda hidden) and `drinks` into the local copy. */
const seed =
  (drinks: Drink[], online = true) =>
  async () => {
    const db = await openUserDb(user.id);
    await db.put(
      'kv',
      {
        units: 'metric',
        locale: 'en',
        waterEnabled: true,
        hiddenDrinks: ['soda'],
      } as AccountSettings,
      'settings',
    );
    await db.clear('drinks');
    for (const d of drinks) await db.put('drinks', d);
    db.close();
    if (online) return;
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false,
    });
    return () => void delete (navigator as { onLine?: boolean }).onLine;
  };

/** OCT-147 3.3: the «Drinks» screen in settings. */
const meta = {
  title: 'Settings/Drinks',
  decorators: [
    (Story) => (
      <ToastProvider>
        <DataProvider user={user}>
          <UndoDeleteProvider>
            <div className="screen__body">
              <Story />
            </div>
          </UndoDeleteProvider>
        </DataProvider>
      </ToastProvider>
    ),
  ],
  parameters: { layout: 'fullscreen' },
  render: () => <DrinksScreen />,
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const dark = { globals: { theme: 'dark' } };

/** Own drinks on top, built-ins with switches; soda is hidden, water is locked on. */
export const Default: Story = { beforeEach: seed(own) };
export const DefaultDark: Story = { ...Default, ...dark };
/** No own drinks yet: only «Your drink». */
export const Empty: Story = { beforeEach: seed([]) };
export const EmptyDark: Story = { ...Empty, ...dark };
/** Offline: the switches still work (queued); the sheet explains why it can’t save. */
export const Offline: Story = { beforeEach: seed(own, false) };
export const OfflineDark: Story = { ...Offline, ...dark };
