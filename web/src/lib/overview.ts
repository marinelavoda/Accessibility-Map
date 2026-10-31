// The limits the Overview page uses, in one place so they're easy to change.
// No imports, so the tests can load it directly.

/** The "Submissions waiting" box turns red when the oldest has waited longer than this. */
export const URGENT_AFTER_DAYS = 14;

/** A place last verified longer ago than this counts as an old rating. */
export const STALE_AFTER_MONTHS = 24;

/** "This week" means the last 7 days, not since Monday. */
export const WEEK_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Places verified before this date are old ratings. Calendar months, so 24 months = 2 years. */
export function staleCutoff(now = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - STALE_AFTER_MONTHS);
  return cutoff;
}

/** The start of "this week": exactly 7 days ago. */
export function weekStart(now = new Date()): Date {
  return new Date(now.getTime() - WEEK_DAYS * DAY_MS);
}

/** Whole days since `date` (0 on the same day). */
export function daysSince(date: Date, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / DAY_MS));
}

/** True when the oldest waiting submission has waited more than URGENT_AFTER_DAYS. */
export function isUrgent(oldestWaiting: Date | null, now = new Date()): boolean {
  return oldestWaiting !== null && daysSince(oldestWaiting, now) > URGENT_AFTER_DAYS;
}

/** 34 for 41 of 120. Rounded down, so it only says 100% when every place is rated. */
export function percent(part: number, whole: number): number {
  return whole > 0 ? Math.floor((part / whole) * 100) : 0;
}
