import { exportSummarySchema, type ErrorCode } from '@oct/shared';
import { ApiError, api } from './client';

/** `query`: the URL query of GET /export and /export/summary (ADR-0026 §3). */
export const exportSummary = (query: string, signal?: AbortSignal) =>
  api(`/api/export/summary?${query}`, exportSummarySchema, { signal });

type DownloadOptions = {
  signal: AbortSignal;
  /** `summary.bytes`, used when a proxy drops Content-Length. */
  total?: number;
  /** Whole percent, 0–99; 100 is the file itself. */
  onProgress: (percent: number) => void;
};

/**
 * Reads the body chunk by chunk for a real percent (ADR-0026 §4) and returns the file.
 * The whole file is held in memory; a Blob too big for the device is `export_too_large`.
 */
export async function downloadExport(
  query: string,
  { signal, total, onProgress }: DownloadOptions,
): Promise<File> {
  let res: Response;
  try {
    res = await fetch(`/api/export?${query}`, {
      signal,
      credentials: 'same-origin',
    });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new ApiError(0, 'network');
  }
  if (!res.ok || !res.body) {
    const code: unknown = await res
      .json()
      .then((b: { error?: { code?: unknown } }) => b.error?.code)
      .catch(() => undefined);
    throw new ApiError(
      res.status,
      typeof code === 'string' ? (code as ErrorCode) : 'internal',
    );
  }
  const size = Number(res.headers.get('Content-Length')) || total;
  const reader = res.body.getReader();
  // A cancelled read ends as `done`, so the check after the loop tells it from the end.
  signal.addEventListener('abort', () => void reader.cancel(), { once: true });
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let read = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value as Uint8Array<ArrayBuffer>);
      read += value.length;
      if (size) onProgress(Math.min(99, Math.floor((read * 100) / size)));
    }
  } catch (err) {
    if (signal.aborted) throw err;
    throw new ApiError(0, 'network');
  }
  signal.throwIfAborted();
  const name =
    /filename="([^"]+)"/.exec(
      res.headers.get('Content-Disposition') ?? '',
    )?.[1] ?? 'oct-export';
  try {
    return new File(chunks, name, {
      type: res.headers.get('Content-Type') ?? '',
    });
  } catch {
    throw new ApiError(413, 'export_too_large');
  }
}

/** Hands the file to the browser's downloads. */
export function saveFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  // Safari drops the download if the URL goes at once.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
