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
