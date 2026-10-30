import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { listReviewQueue } from "@/server/dashboard";
import { requireRole } from "@/server/require-role";

// Read-only for now. Opening, approving and rejecting a submission is the next step.
export default async function ReviewQueuePage() {
  await requireRole("reviewer");
  const queue = await listReviewQueue();

  return (
    <div className="space-y-6">
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
              <TableHead>Submitted by</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Being reviewed by</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {queue.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.placeName}</TableCell>
                <TableCell>
                  <Badge variant={s.kind === "update" ? "secondary" : "default"}>
                    {s.kind === "update" ? "Update" : "First assessment"}
                  </Badge>
                </TableCell>
                <TableCell>{s.submittedBy}</TableCell>
                <TableCell>{formatDate(s.submittedAt)}</TableCell>
                <TableCell>{s.openedBy ? `${s.openedBy}, since ${formatDate(s.openedSince)}` : "—"}</TableCell>
              </TableRow>
            ))}
            {queue.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Nothing to review.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
