import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { STALE_AFTER_MONTHS, URGENT_AFTER_DAYS, WEEK_DAYS, daysSince, isUrgent, percent } from "@/lib/overview";
import { cn } from "@/lib/utils";
import { getOverview } from "@/server/dashboard";
import { requireRole } from "@/server/require-role";

const linkClass = "underline underline-offset-4";
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// The first page staff see: what needs doing (top), then how far the map has got.
// Every number links to the list it counts. The limits (14 days, 24 months) are in src/lib/overview.ts.
export default async function OverviewPage() {
  const user = await requireRole("reviewer");
  const { waiting, coverage, week } = await getOverview(user.id);
  const urgent = isUrgent(waiting.oldest);
  const waitedDays = waiting.oldest ? daysSince(waiting.oldest) : 0;

  const levels = [
    { key: "accessible", symbol: "✓", label: "Accessible" },
    { key: "partial", symbol: "◐", label: "Partially accessible" },
    { key: "inaccessible", symbol: "✗", label: "Inaccessible" },
    { key: "unrated", symbol: "–", label: "Not yet rated" },
  ] as const;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-muted-foreground">Welcome, {user.name}.</p>
      </div>

      <section aria-labelledby="attention-heading">
        <Card className={cn(urgent && "ring-2 ring-destructive")}>
          <CardHeader>
            <CardTitle id="attention-heading" className="text-lg">
              Needs attention
            </CardTitle>
          </CardHeader>
          <CardContent>
            {waiting.count === 0 ? (
              <p>Nothing waiting for review: all caught up ✓</p>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-lg font-medium">{plural(waiting.count, "submission")} waiting for review</p>
                  <p className={cn("text-sm", urgent ? "font-medium text-destructive" : "text-muted-foreground")}>
                    {urgent && `Waiting over ${URGENT_AFTER_DAYS} days. `}
                    Oldest waiting {waitedDays === 0 ? "since today" : plural(waitedDays, "day")}
                    {waitedDays > 0 && ` (since ${formatDate(waiting.oldest)})`}.
                  </p>
                </div>
                <Button nativeButton={false} variant={urgent ? "destructive" : "default"} render={<Link href="/dashboard/review" />}>
                  Review now
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="coverage-heading" className="space-y-3">
        <div>
          <h2 id="coverage-heading" className="text-lg font-semibold">
            Coverage
          </h2>
          <p className="text-sm text-muted-foreground">Places shown in the app.</p>
        </div>
        <p className="text-xl">
          <span className="font-semibold tabular-nums">{coverage.rated}</span> of{" "}
          <Link href="/dashboard/places?status=active" className={linkClass}>
            {plural(coverage.active, "place")}
          </Link>{" "}
          rated ({percent(coverage.rated, coverage.active)}%)
        </p>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {levels.map((level) => (
            <li key={level.key}>
              <Card size="sm">
                <CardHeader>
                  <CardDescription>
                    <Link href={`/dashboard/places?level=${level.key}&status=active`} className={linkClass}>
                      <span aria-hidden="true">{level.symbol} </span>
                      {level.label}
                    </Link>
                  </CardDescription>
                  <CardTitle className="text-2xl tabular-nums">{coverage.byLevel[level.key]}</CardTitle>
                </CardHeader>
              </Card>
            </li>
          ))}
        </ul>
        <ul className="space-y-1 text-sm">
          <li>
            <Link href="/dashboard/places?status=active&verified=old" className={linkClass}>
              {plural(coverage.stale, "place")}
            </Link>{" "}
            last verified over {STALE_AFTER_MONTHS} months ago
          </li>
          <li className="text-muted-foreground">
            Also{" "}
            <Link href="/dashboard/places?status=hidden" className={linkClass}>
              {plural(coverage.hidden, "hidden place")}
            </Link>
            , not counted above.
          </li>
        </ul>
      </section>

      <section aria-labelledby="week-heading" className="space-y-3">
        <div>
          <h2 id="week-heading" className="text-lg font-semibold">
            This week
          </h2>
          <p className="text-sm text-muted-foreground">The last {WEEK_DAYS} days.</p>
        </div>
        <dl className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Submissions received", value: week.received },
            { label: "Submissions decided", value: week.decided },
            { label: "Decided by you", value: week.decidedByYou },
          ].map((item) => (
            <Card key={item.label} size="sm">
              <CardHeader>
                <dt className="text-sm text-muted-foreground">{item.label}</dt>
                <dd className="text-2xl font-semibold tabular-nums">{item.value}</dd>
              </CardHeader>
            </Card>
          ))}
        </dl>
      </section>
    </div>
  );
}
