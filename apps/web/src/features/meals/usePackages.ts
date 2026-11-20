import {
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { z } from 'zod';
import {
  mergePackages,
  packageRecognitionSchema,
  type PhotoBarcodesResponse,
} from '@oct/shared';
import { api, ApiError } from '../../api/client';
import { useT } from '../../i18n';
import { useToast } from '../../ui/Toast/Toast';
import { ImageDecodeError, prepareImage } from './prepareImage';
import { toRows, type Recognized, type Row } from './refine';

const photoSchema = z.object({ photoId: z.string() });

/** `history.state` of the edit screen while the label camera is open. */
const keepDraft = (draft: Row[] | undefined) => {
  const state = { ...(history.state ?? {}) } as { draft?: Row[] };
  delete state.draft;
  history.replaceState(draft ? { ...state, draft } : state, '');
};

/**
 * Packages on the edit screen: «Photograph the label» (OCT-313 2.4) and the Open Food Facts
 * offer (OCT-313 2.5). `onReplace` runs before the rows are replaced.
 */
export function usePackages({
  codes,
  offSuggest,
  onOffHint,
  rows,
  setRows,
  onReplace,
}: {
  codes: PhotoBarcodesResponse['codes'];
  offSuggest?: boolean;
  onOffHint?: (enable: boolean) => Promise<PhotoBarcodesResponse['codes']>;
  rows: Row[];
  setRows: Dispatch<SetStateAction<Row[]>>;
  onReplace: () => void;
}) {
  const { t } = useT();
  const toast = useToast();
  // «Photograph the label»: the code it is read for (OCT-313 2.4).
  const labelInput = useRef<HTMLInputElement>(null);
  const labelCode = useRef<string | null>(null);
  const [reading, setReading] = useState(false);
  const [offLoading, setOffLoading] = useState(false);
  const [suggest, setSuggest] = useState(!!offSuggest);
  const [consent, setConsent] = useState(false);

  /**
   * New package dishes in place of the rows with the same code, the rest added; «Undo» brings
   * the whole list back (OCT-313 2.4, 4.4).
   */
  const replacePackages = (
    found: Recognized[],
    text: 'edit.label_updated' | 'edit.off_found',
  ) => {
    if (!found.length) return;
    let before: Row[] = [];
    onReplace();
    setRows((rs) => {
      before = rs;
      const fresh = toRows(found);
      const next = rs.map(
        (r) =>
          fresh.find(
            (f) =>
              !!f.original.barcode && f.original.barcode === r.original.barcode,
          ) ?? r,
      );
      return [...next, ...fresh.filter((f) => !next.includes(f))];
    });
    toast({
      text: t(text),
      ms: 5000,
      action: { label: t('common.undo'), onClick: () => setRows(before) },
    });
  };

  const shootLabel = (code: string) => {
    labelCode.current = code;
    // The camera may unload the page: the edits come back from `history.state`.
    keepDraft(rows);
    labelInput.current?.click();
  };

  // Read as this package's label only (ADR-0034 §2); a failure leaves the list as it was.
  const onLabel = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const code = labelCode.current;
    if (!file || !code) return keepDraft(undefined);
    setReading(true);
    try {
      const blob = await prepareImage(file);
      const { photoId: id } = await api('/api/photos', photoSchema, {
        method: 'POST',
        body: blob,
      });
      const read = await api(
        `/api/photos/${encodeURIComponent(id)}/recognize?mode=label&barcode=${code}`,
        packageRecognitionSchema,
        { method: 'POST' },
      );
      const found = mergePackages(
        read.dishes
          .slice(0, 1)
          .map((d) => ({ ...d, barcode: code, label: true })),
        codes.filter((c) => c.code === code),
      );
      if (found.length) replacePackages(found, 'edit.label_updated');
      else toast({ text: t('edit.label_failed') });
    } catch (err) {
      if (err instanceof ImageDecodeError)
        toast({ text: t('capture.err.open.title') });
      else if (err instanceof ApiError && err.status === 0)
        toast({ text: t('capture.upload_failed') });
      else if (err instanceof ApiError) toast({ text: t('edit.label_failed') });
      else throw err;
    } finally {
      keepDraft(undefined);
      setReading(false);
    }
  };

  const offLater = () => {
    setSuggest(false);
    setConsent(false);
    void onOffHint?.(false);
  };
  const offEnable = async () => {
    setSuggest(false);
    setConsent(false);
    setOffLoading(true);
    try {
      const found = await onOffHint?.(true);
      if (found) replacePackages(mergePackages([], found), 'edit.off_found');
    } finally {
      setOffLoading(false);
    }
  };

  return {
    labelInput,
    reading,
    offLoading,
    suggest,
    consent,
    askConsent: () => setConsent(true),
    shootLabel,
    onLabel,
    offLater,
    offEnable,
  };
}
