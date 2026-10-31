"use server";

// "Save" on the Edit accessibility page. requireRole("admin") comes first (hard rule 1):
// anyone can send a request to a server action, so this check is what counts.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { LEVELS, type Level } from "@/lib/scoring";
import type { Correction } from "@/server/approval-plan";
import { requireRole } from "@/server/require-role";
import { ApprovalError, saveAdminEdit } from "@/server/review";

export type EditState = { error: string } | null;

export async function saveAssessment(_previous: EditState, form: FormData): Promise<EditState> {
  const admin = await requireRole("admin");
  const placeId = String(form.get("placeId"));
  const level = form.get("level");
  if (!LEVELS.includes(level as Level)) return { error: "Choose the level to publish." };

  let answers: Record<string, Correction>;
  try {
    answers = JSON.parse(String(form.get("answers") ?? "{}"));
  } catch {
    return { error: "The answers couldn't be read. Reload the page and try again." };
  }

  let published: boolean;
  try {
    ({ published } = await saveAdminEdit(admin, placeId, answers, level as Level, {
      expectedCurrentId: String(form.get("expectedCurrentId") ?? "") || null,
      newVisit: form.get("newVisit") === "yes",
      note: String(form.get("note") ?? ""),
    }));
  } catch (error) {
    if (error instanceof ApprovalError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/dashboard/places/${placeId}`);
  redirect(`/dashboard/places/${placeId}?saved=${published ? "assessment" : "assessment-unpublished"}`);
}
