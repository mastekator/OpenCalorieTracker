import { addDays } from '@oct/shared';
import { z } from 'zod';

export { localToday } from './useToday';

const isoDate = z.iso.date();

/** The day a `/diary/:date` address may show: a real date, not after today (AC-2.3). */
export const diaryDay = (date: string, today: string) =>
  isoDate.safeParse(date).success && date <= today ? date : today;

/**
 * Pager label: «Today» / «Yesterday» over the full date («Wednesday, November 12»),
 * else «Tue, November 4» over the year when it is not this year (OCT-19 6.1, 6.2).
 */
export function dayLabel(
  date: string,
  today: string,
  locale: string,
  t: (key: 'day.today' | 'day.yesterday') => string,
) {
  const otherYear = date.slice(0, 4) !== today.slice(0, 4);
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(
      new Date(`${date}T00:00:00Z`),
    );
  const near =
    date === today
      ? t('day.today')
      : date === addDays(today, -1)
        ? t('day.yesterday')
        : null;
  if (near)
    return {
      label: near,
      sub: format({
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        ...(otherYear && { year: 'numeric' }),
      }),
    };
  return {
    label: format({ weekday: 'short', day: 'numeric', month: 'long' }),
    sub: otherYear ? date.slice(0, 4) : null,
  };
}
