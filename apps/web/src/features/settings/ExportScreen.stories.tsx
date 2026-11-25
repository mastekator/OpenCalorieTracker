import type { Meta, StoryObj } from '@storybook/react-vite';
import type { MeResponse } from '@oct/shared';
import { DataProvider } from '../../data/DataContext';
import { atPath } from '../../ui/navStory';
import { ToastProvider } from '../../ui/Toast/Toast';
import { ExportScreen } from './ExportScreen';

const user = { id: 1, role: 'user', locale: 'en' } as MeResponse;

/** Summary at once; the download answers `download` (a body that never ends). */
const serve =
  (download: () => Response, offline = false) =>
  () => {
    const real = globalThis.fetch;
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.startsWith('/api/export/summary'))
        return Response.json({
          days: 412,
          dishes: 1630,
          photos: url.includes('photos=1') ? 380 : 0,
          bytes: url.includes('photos=1') ? 96_000_000 : 1_400_000,
        });
      if (url.startsWith('/api/export?')) return download();
      return new Response(null, { status: 204 });
    };
    if (offline)
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        get: () => false,
      });
    return () => {
      globalThis.fetch = real;
      if (offline) delete (navigator as { onLine?: boolean }).onLine;
    };
  };
/** 40 of 100 bytes, then it waits. */
const halfway = () =>
  new Response(
    new ReadableStream({ start: (c) => c.enqueue(new Uint8Array(40)) }),
    { headers: { 'Content-Length': '100' } },
  );
const tooLarge = () =>
  Response.json({ error: { code: 'export_too_large' } }, { status: 413 });

/** Export, OCT-187 2.1–2.5. Theme and language: toolbar. */
const meta = {
  title: 'Settings/Export',
  decorators: [
    atPath,
    (Story) => (
      <ToastProvider>
        <DataProvider user={user}>
          <div className="screen__body">
            <Story />
          </div>
        </DataProvider>
      </ToastProvider>
    ),
  ],
  parameters: { layout: 'fullscreen' },
  render: () => <ExportScreen />,
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const dark = { globals: { theme: 'dark' } };

/** JSON, all time, no photos. */
export const Default: Story = { beforeEach: serve(halfway) };
export const DefaultDark: Story = { ...Default, ...dark };

/** CSV, dates and photos: a ZIP, ~N photos. */
export const DatesPhotos: Story = {
  beforeEach: serve(halfway),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('radio', { name: 'CSV' }));
    await userEvent.click(canvas.getByRole('radio', { name: /dates|даты/i }));
    await userEvent.click(canvas.getByRole('switch'));
  },
};
export const DatesPhotosDark: Story = { ...DatesPhotos, ...dark };

/** The real percent and «Cancel». */
export const Downloading: Story = {
  beforeEach: serve(halfway),
  play: async ({ canvas, userEvent }) => {
    await canvas.findByText(/412/);
    await userEvent.click(canvas.getByRole('button', { name: /JSON/ }));
  },
};
export const DownloadingDark: Story = { ...Downloading, ...dark };

/** Too big for the device. */
export const TooLarge: Story = { ...Downloading, beforeEach: serve(tooLarge) };
export const TooLargeDark: Story = { ...TooLarge, ...dark };

/** Offline: the button is off. */
export const Offline: Story = { beforeEach: serve(halfway, true) };
export const OfflineDark: Story = { ...Offline, ...dark };
