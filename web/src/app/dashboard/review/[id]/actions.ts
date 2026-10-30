"use server";

// Server actions for the review page. Each one checks the role first (hard rule 1):
// anyone can send a request to a server action, so the check here is what counts.

import { redirect } from "next/navigation";
import { LEVELS, type Level } from "@/lib/scoring";
import { requireRole } from "@/server/require-role";
import type { Correction } from "@/server/approval-plan";
import { ApprovalError, approveSubmission, markOpened, nextPendingSubmissionId, rejectSubmission } from "@/server/review";

export type DecisionState = { error: string } | null;

/** Called when the page opens, for the "opened by …" warning other reviewers see. */
export async function openSubmission(submissionId: string) {
  const reviewer = await requireRole("reviewer");
  await markOpened(reviewer, submissionId);
}

export async function approve(_previous: DecisionState, form: FormData): Promise<DecisionState> {
  const reviewer = await requireRole("reviewer");
  const submissionId = String(form.get("submissionId"));
  const level = form.get("level");
  if (!LEVELS.includes(level as Level)) return { error: "Choose the level to publish." };

  let corrections: Record<string, Correction>;
  try {
    corrections = JSON.parse(String(form.get("corrections") ?? "{}"));
  } catch {
    return { error: "The answers couldn't be read. Reload the page and try again." };
  }

  let published: boolean;
  try {
    ({ published } = await approveSubmission(reviewer, submissionId, corrections, level as Level));
  } catch (error) {
    if (error instanceof ApprovalError) return { error: error.message };
    throw error;
  }
  await goToNext(submissionId, published ? "published" : "approved");
  return null;
}

export async function reject(_previous: DecisionState, form: FormData): Promise<DecisionState> {
  const reviewer = await requireRole("reviewer");
  const submissionId = String(form.get("submissionId"));
  try {
    await rejectSubmission(reviewer, submissionId, String(form.get("reason") ?? ""));
  } catch (error) {
    if (error instanceof ApprovalError) return { error: error.message };
    throw error;
  }
  await goToNext(submissionId, "rejected");
  return null;
}

/** After a decision: the next submission in the queue, or the queue itself when it's empty. */
async function goToNext(decidedId: string, done: "published" | "approved" | "rejected") {
  const next = await nextPendingSubmissionId(decidedId);
  redirect(next ? `/dashboard/review/${next}?done=${done}` : `/dashboard/review?done=${done}`);
}
