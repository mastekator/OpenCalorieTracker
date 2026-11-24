import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { fn } from 'storybook/test';
import type { DraftPreview, NeedsMapping, PastImport } from '../../api/imports';
import { useT } from '../../i18n';
import { Banner } from '../../ui/Banner/Banner';
import { atPath } from '../../ui/navStory';
import {
  DeleteImportDialog,
  DoneStep,
  MappingStep,
  PreviewStep,
  SourceStep,
} from './ImportScreen';

const csv = { id: 5, file: 'diary-2024.csv', source: 'csv' as const };
const oct = { id: 5, file: 'oct-export-2026.json', source: 'oct' as const };
const head: NeedsMapping = {
  id: 5,
  needsMapping: true,
  headers: [
    'Date',
    'Meal',
    'Food',
    'Amount',
    'Protein (g)',
    'Carbs (g)',
    'Energy',
  ],
  columns: { date: 0, meal: 1, name: 2, grams: 3, protein: 4, carbs: 5 },
  sample: [['03/04/2024', 'Breakfast', 'Oatmeal', '60', '11', '54', '312']],
};
const rec = (
  localDate: string,
  mealType: 'breakfast' | 'lunch' | 'dinner',
  name: string,
  grams: number,
  kcal: number,
  p: number,
  f: number,
  c: number,
) => ({
  localDate,
  time: null,
  mealType,
  name,
  grams,
  kcal,
  proteinG: p,
  fatG: f,
  carbsG: c,
});
const preview = (all = false): DraftPreview => ({
  id: 5,
  period: { from: '2023-03-14', to: '2026-11-09' },
  days: all ? 635 : 598,
  records: all ? 4471 : 4212,
  skippedDays: all ? 0 : 37,
  skippedRecords: all ? 0 : 259,
  first: [
    rec('2023-03-14', 'breakfast', 'Oatmeal with milk', 250, 312, 11, 8, 54),
    rec('2023-03-14', 'breakfast', 'Banana', 120, 107, 1, 0, 27),
    rec('2023-03-14', 'lunch', 'Lunch total', 0, 684, 38, 24, 71),
    rec('2023-03-14', 'dinner', 'Chicken breast', 180, 297, 56, 6, 0),
  ],
  unrecognized: {
    count: 6,
    rows: [
      { line: 1208, reason: 'no_kcal' },
      { line: 3901, reason: 'bad_date' },
      { line: 4002, reason: 'no_kcal' },
      { line: 4100, reason: 'no_kcal' },
      { line: 4180, reason: 'bad_date' },
      { line: 4200, reason: 'no_kcal' },
    ],
  },
  ambiguousDates: false,
});

/** The file error banner as the screen shows it (3.6). */
function FileError({ text }: { text: string }) {
  const { t } = useT();
  return (
    <Banner tone="danger" title={t('integr.import.error_title')}>
      {t(text as 'integr.import.too_big')}
    </Banner>
  );
}

/** Import, OCT-187 3.1–3.6 and desktop 8.2. Theme and language: toolbar. */
const meta = {
  title: 'Settings/Import',
  decorators: [
    atPath,
    (Story) => (
      <div className="screen__body">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'fullscreen' },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const dark = { globals: { theme: 'dark' } };
const desktop = { viewport: { value: 'desktop' } };
const column = (node: ReactNode) => <div className="screen">{node}</div>;

const past: PastImport[] = [
  { id: 2, source: 'csv', committedAt: Date.UTC(2026, 10, 20), records: 4212 },
  { id: 1, source: 'oct', committedAt: Date.UTC(2026, 9, 3), records: 1 },
];
const source = (
  banner?: ReactNode,
  online = true,
  history: PastImport[] | null = null,
  deleting: number | null = null,
) => (
  <SourceStep
    online={online}
    busy={false}
    banner={banner}
    history={history}
    deleting={deleting}
    onFile={fn()}
    onWrongFile={fn()}
    onDelete={fn()}
  />
);

/** 3.6: past imports under the sources, each with «Delete import». */
export const History: Story = { render: () => source(undefined, true, past) };
export const HistoryDark: Story = { ...History, ...dark };
export const HistoryEmpty: Story = {
  render: () => source(undefined, true, []),
};
export const HistoryEmptyDark: Story = { ...HistoryEmpty, ...dark };
/** The DELETE is in flight: that button spins, the others wait. */
export const HistoryDeleting: Story = {
  render: () => source(undefined, true, past, 2),
};
export const HistoryDeletingDark: Story = { ...HistoryDeleting, ...dark };
/** Loaded, then the connection dropped: the list stays, deleting needs the server. */
export const HistoryOffline: Story = {
  render: () => source(undefined, false, past),
};
export const HistoryOfflineDark: Story = { ...HistoryOffline, ...dark };

/** 3.7: the confirm says what goes, edited meals included. */
const confirm = (edited: number) => (
  <DeleteImportDialog
    info={{ records: 4212, edited, days: 598 }}
    onConfirm={fn()}
    onCancel={fn()}
  />
);
export const DeleteConfirm: Story = { render: () => confirm(3) };
export const DeleteConfirmDark: Story = { ...DeleteConfirm, ...dark };
export const DeleteConfirmUnedited: Story = { render: () => confirm(0) };
export const DeleteConfirmUneditedDark: Story = {
  ...DeleteConfirmUnedited,
  ...dark,
};

/** 3.1: sources; MyFitnessPal and Cronometer come later. On a desktop, the drop zone. */
export const Source: Story = { render: () => source() };
export const SourceDark: Story = { ...Source, ...dark };
export const SourceDesktop: Story = {
  render: () => column(source()),
  globals: desktop,
};
export const SourceDesktopDark: Story = {
  ...SourceDesktop,
  globals: { ...desktop, theme: 'dark' },
};
export const SourceOffline: Story = { render: () => source(undefined, false) };
export const SourceOfflineDark: Story = { ...SourceOffline, ...dark };

/** 3.6: file errors come back to the sources with a banner. */
export const ErrorWrongFile: Story = {
  render: () => source(<FileError text="integr.import.wrong_oct" />),
};
export const ErrorWrongFileDark: Story = { ...ErrorWrongFile, ...dark };
export const ErrorTooBig: Story = {
  render: () => source(<FileError text="integr.import.too_big" />),
};
export const ErrorTooBigDark: Story = { ...ErrorTooBig, ...dark };
export const ErrorAlreadyImported: Story = {
  render: () => source(<FileError text="integr.import.already" />),
};
export const ErrorAlreadyImportedDark: Story = {
  ...ErrorAlreadyImported,
  ...dark,
};

const mapping = (askDate = false) => (
  <MappingStep
    draft={csv}
    head={head}
    busy={false}
    online
    banner={null}
    onNext={fn()}
    onCancel={fn()}
    askDate={askDate}
  />
);
/** 3.2: guessed columns; no kcal column, so «Next» is off. */
export const Mapping: Story = { render: () => mapping() };
export const MappingDark: Story = { ...Mapping, ...dark };
/** 3.2 (E-2): the file can't tell the date order. */
export const MappingDates: Story = { render: () => mapping(true) };
export const MappingDatesDark: Story = { ...MappingDates, ...dark };

const previewStep = (all = false, unsynced = false, p = preview(all)) => (
  <PreviewStep
    draft={oct}
    preview={p}
    all={all}
    unsynced={unsynced}
    busy={false}
    committing={false}
    online
    banner={null}
    onInclude={fn()}
    onCommit={fn()}
    onCancel={fn()}
  />
);
/** 3.3: period, days, entries, skipped days, first rows, unrecognised rows. */
export const Preview: Story = { render: () => previewStep() };
export const PreviewDark: Story = { ...Preview, ...dark };
/** 3.4: those days too, with unsent entries on this phone (E-3). */
export const PreviewAllUnsynced: Story = {
  render: () => previewStep(true, true),
};
export const PreviewAllUnsyncedDark: Story = { ...PreviewAllUnsynced, ...dark };
/** Every day is already in the diary: nothing to import. */
export const PreviewNothing: Story = {
  render: () =>
    previewStep(false, false, {
      ...preview(),
      days: 0,
      records: 0,
      skippedDays: 598,
      skippedRecords: 4212,
      first: [],
      unrecognized: { count: 0, rows: [] },
    }),
};
export const PreviewNothingDark: Story = { ...PreviewNothing, ...dark };
/** Not one row could be read: check the file and the columns. */
export const PreviewNothingRead: Story = {
  render: () =>
    previewStep(false, false, {
      ...preview(),
      period: null,
      days: 0,
      records: 0,
      first: [],
      unrecognized: {
        count: 2,
        rows: [
          { line: 2, reason: 'no_date' },
          { line: 3, reason: 'no_kcal' },
        ],
      },
    }),
};
export const PreviewNothingReadDark: Story = { ...PreviewNothingRead, ...dark };
/** 8.2: the first rows with macros. */
export const PreviewDesktop: Story = {
  render: () => column(previewStep()),
  globals: desktop,
};
export const PreviewDesktopDark: Story = {
  ...PreviewDesktop,
  globals: { ...desktop, theme: 'dark' },
};

/** 3.5: done. */
export const Done: Story = { render: () => <DoneStep records={4212} /> };
export const DoneDark: Story = { ...Done, ...dark };
