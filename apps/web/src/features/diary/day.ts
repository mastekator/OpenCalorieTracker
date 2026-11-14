import { addDays } from '@oct/shared';
import { z } from 'zod';

/** Today on this device, `YYYY-MM-DD`. */
export const localToday = () => new Date().toLocaleDateString('sv');

const isoDate = z.iso.date();

/** The day a `/diary/:date` address may show: a real date, not after today (AC-2.3). */
export const diaryDay = (date: string, today: string) =>
  isoDate.safeParse(date).success && date <= today ? date : today;

/** «Today», «Yesterday», else «Tue, November 4»; `year` only when not this year. */
export function dayLabel(
  date: string,
  today: string,
  locale: string,
  t: (key: 'day.today' | 'day.yesterday') => string,
) {
  const year = date.slice(0, 4) === today.slice(0, 4) ? null : date.slice(0, 4);
  if (date === today) return { label: t('day.today'), year };
  if (date === addDays(today, -1)) return { label: t('day.yesterday'), year };
  const label = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
  return { label, year };
}
