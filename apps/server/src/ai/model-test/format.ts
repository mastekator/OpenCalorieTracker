import type { AiTestPhoto } from '@oct/shared';

/** One photo of a model test run; the `photos` JSON of ai_test_runs (ADR-0019). */
export type ModelTestPhoto = AiTestPhoto;

/** A model test run, named after the ai_test_runs columns (ADR-0019). Holds no key or URL. */
export interface ModelTestRun {
  /** Provider id only: openai-compatible never carries its base URL. */
  provider: string;
  model: string;
  appVersion: string;
  promptVersion: number;
  /** Epoch ms. */
  startedAt: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costUsd?: number | null;
  photos: ModelTestPhoto[];
}

const passed = (run: ModelTestRun) =>
  run.photos.filter((p) => p.result === 'ok').length;

function secondsPerPhoto(run: ModelTestRun) {
  const ms = run.photos.flatMap((p) => (p.ms === undefined ? [] : [p.ms]));
  if (!ms.length) return '—';
  const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
  return `${(avg / 1000).toFixed(1)} s/photo`;
}

const date = (run: ModelTestRun) =>
  new Date(run.startedAt).toISOString().slice(0, 10);

const versions = (run: ModelTestRun) =>
  `OCT v${run.appVersion}, prompt ${run.promptVersion}`;

// A provider error text could hold a pipe or a newline; either would break the table.
const cell = (v: string | number | undefined) =>
  v === undefined ? '' : String(v).replaceAll('|', '\\|').replace(/\s+/g, ' ');

/** The docs/MODELS.md row, the same from check-model and the admin screen (AC-2.2). */
export function modelsMdRow(run: ModelTestRun) {
  return `| ${cell(run.provider)} | ${cell(run.model)} | ${passed(run)}/${run.photos.length} | ${date(run)} | ${secondsPerPhoto(run)}; ${versions(run)} |`;
}

/** Markdown report of a run for an issue or a PR: English, no key or address (AC-2.11). */
export function reportMarkdown(run: ModelTestRun) {
  const tokens =
    run.inputTokens == null && run.outputTokens == null
      ? '—'
      : `${run.inputTokens ?? 0} in, ${run.outputTokens ?? 0} out`;
  return [
    `## Model test: ${cell(run.provider)} ${cell(run.model)}`,
    '',
    `- Passed: ${passed(run)}/${run.photos.length}`,
    `- Date: ${date(run)} (UTC)`,
    `- Speed: ${secondsPerPhoto(run)}`,
    `- Tokens: ${tokens}`,
    ...(run.costUsd == null ? [] : [`- Cost: $${run.costUsd.toFixed(4)}`]),
    `- ${versions(run)}`,
    '',
    '| Photo | Expected | Got | kcal | Confidence | Time | Result |',
    '| ----- | -------- | --- | ---- | ---------- | ---- | ------ |',
    ...run.photos.map((p) => {
      const time =
        p.ms === undefined ? undefined : `${(p.ms / 1000).toFixed(1)} s`;
      const cells = [
        p.file,
        p.expected,
        p.got,
        p.kcal,
        p.levels,
        time,
        p.result,
      ];
      return `| ${cells.map(cell).join(' | ')} |`;
    }),
    '',
    'Row for docs/MODELS.md:',
    '',
    modelsMdRow(run),
  ].join('\n');
}
