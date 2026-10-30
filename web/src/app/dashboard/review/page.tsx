import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { LEVEL_LABELS } from "@/lib/scoring";
import { listRecentDecisions, listReviewQueue } from "@/server/dashboard";
import { requireRole } from "@/server/require-role";

const DONE_MESSAGE: Record<string, string> = {
  published: "Approved and published on the map.",
  approved: "Approved. The place stays “Not yet rated” until the publishing rule is met.",
  rejected: "Rejected. Nothing was published.",
};

export default async function ReviewQueuePage({ searchParams }: PageProps<"/dashboard/review">) {
  await requireRole("reviewer");
  const { done } = await searchParams;
  const [queue, recent] = await Promise.all([listReviewQueue(), listRecentDecisions()]);

  return (
    <div className="space-y-6">
      {typeof done === "string" && DONE_MESSAGE[done] && (
        <Alert role="status">
          <AlertDescription>{DONE_MESSAGE[done]} The queue is empty now.</AlertDescription>
        </Alert>
      )}

      <div>
        <h1 className="text-2xl font-semibold">Review queue</h1>
        <p className="text-muted-foreground">
          {queue.length} submission{queue.length === 1 ? "" : "s"} waiting, oldest first.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Place</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Suggested level</TableHead>
              <TableHead>Submitted by</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Opened by</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {queue.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">
                  {/* prefetch off: opening the page marks it "opened by you" for other reviewers */}
                  <Link href={`/dashboard/review/${s.id}`} prefetch={false} className="underline underline-offset-4">
                    {s.placeName}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={s.kind === "update" ? "secondary" : "default"}>
                    {s.kind === "update" ? "Update" : "First assessment"}
                  </Badge>
                </TableCell>
                <TableCell>{s.suggestedLevel ? LEVEL_LABELS[s.suggestedLevel] : "—"}</TableCell>
                <TableCell>{s.submittedBy}</TableCell>
                <TableCell>{formatDate(s.submittedAt)}</TableCell>
                <TableCell>{s.openedBy ? `${s.openedBy}, ${formatDate(s.openedSince)}` : "—"}</TableCell>
              </TableRow>
            ))}
            {queue.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Nothing to review.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {recent.length > 0 && (
        <section aria-labelledby="recent-heading" className="space-y-2">
          <h2 id="recent-heading" className="text-lg font-semibold">
            Recently decided
          </h2>
          <ul className="divide-y rounded-lg border text-sm">
            {recent.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                <Link href={`/dashboard/review/${s.id}`} prefetch={false} className="font-medium underline-offset-4 hover:underline">
                  {s.placeName}
                </Link>
                <Badge variant={s.status === "rejected" ? "destructive" : "outline"}>
                  {s.status === "approved" ? "Approved" : "Rejected"}
                </Badge>
                <span className="text-muted-foreground">
                  by {s.decidedBy} on {formatDate(s.reviewedAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
