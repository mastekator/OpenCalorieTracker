// Calendar dates are 'YYYY-MM-DD' strings; arithmetic in UTC so no time zone leaks in.
const DAY_MS = 86_400_000;

const toMs = (date: string) => Date.parse(`${date}T00:00:00Z`);
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const addDays = (date: string, days: number) =>
  fromMs(toMs(date) + days * DAY_MS);

export const addYears = (date: string, years: number) => {
  const d = new Date(toMs(date));
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return fromMs(d.getTime());
};

export const daysBetween = (from: string, to: string) =>
  Math.round((toMs(to) - toMs(from)) / DAY_MS);

/** Full years on `today` (E-1.2): the age changes on the birthday itself. */
export const ageYears = (birthDate: string, today: string) => {
  const years = Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4));
  return today.slice(5) < birthDate.slice(5) ? years - 1 : years;
};

export interface Period {
  from: string;
  to: string;
}

/** The Monday–Sunday week holding `date`. */
export const weekOf = (date: string): Period => {
  const from = addDays(date, -((new Date(toMs(date)).getUTCDay() + 6) % 7));
  return { from, to: addDays(from, 6) };
};

/** The calendar month holding `date`. */
export const monthOf = (date: string): Period => {
  const [y, m] = date.split('-').map(Number) as [number, number];
  return {
    from: `${date.slice(0, 7)}-01`,
    to: fromMs(Date.UTC(y, m, 0)),
  };
};

/** ISO 8601 week id, e.g. '2026-W46': the year is the one of the week's Thursday. */
export const isoWeekId = (date: string) => {
  const thursday = addDays(weekOf(date).from, 3);
  const year = thursday.slice(0, 4);
  const week = Math.floor(daysBetween(`${year}-01-01`, thursday) / 7) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
};

/** The period of a URL id, '2026-W46' or '2026-11'; null when there is no such week or month. */
export const parsePeriodId = (id: string): Period | null => {
  const week = /^(\d{4})-W(\d{2})$/.exec(id);
  if (week) {
    // 4 January is always in week 1.
    const from = addDays(
      weekOf(`${week[1]}-01-04`).from,
      (Number(week[2]) - 1) * 7,
    );
    return Number(week[2]) > 0 && isoWeekId(from) === id ? weekOf(from) : null;
  }
  const month = /^\d{4}-(\d{2})$/.exec(id);
  return month && Number(month[1]) >= 1 && Number(month[1]) <= 12
    ? monthOf(`${id}-01`)
    : null;
};

/** Whether `from..to` is exactly a Monday–Sunday week or a calendar month (ADR-0010). */
export const isPeriod = (from: string, to: string) =>
  [weekOf(from), monthOf(from)].some((p) => p.from === from && p.to === to);
