/** "30 Oct 2026", or "—" when there is no date. */
export function formatDate(date: Date | null): string {
  return date ? date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

/** True if `date` is less than `minutes` ago. */
export function isWithinMinutes(date: Date, minutes: number, now = new Date()): boolean {
  return now.getTime() - date.getTime() < minutes * 60_000;
}

/** "just now", "5 minutes ago", "3 hours ago", or the date for anything older than a day. */
export function formatTimeAgo(date: Date, now = new Date()): string {
  const minutes = Math.round((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return `on ${formatDate(date)}`;
}
