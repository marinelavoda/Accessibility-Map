/** "30 Oct 2026", or "—" when there is no date. */
export function formatDate(date: Date | null): string {
  return date ? date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
}
