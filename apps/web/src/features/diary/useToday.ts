import { useEffect, useState } from 'react';

/** Today on this device, `YYYY-MM-DD`. */
export const localToday = () => new Date().toLocaleDateString('sv');

/** Today's local date; moves on at midnight and when the app comes back from the background (AC-1.12). */
export function useToday() {
  const [today, setToday] = useState(localToday);
  useEffect(() => {
    const check = () => setToday(localToday());
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      const now = new Date();
      // The next local midnight, not now + 24 h: a DST day is 23 or 25 hours long.
      const midnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
      );
      timer = setTimeout(() => {
        check();
        arm(); // also covers a timer that fires a little early
      }, midnight.getTime() - now.getTime());
    };
    arm();
    document.addEventListener('visibilitychange', check);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return today;
}
