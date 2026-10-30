"use server";

// Server action: runs on the server when an admin presses "Save" next to a person.
// Anyone can send a request to a server action, so the checks here are what count.

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { changeLog, users } from "@/db/schema";
import { requireRole } from "@/server/require-role";
import { isRole } from "@/server/roles";

export type RoleFormState = { message: string; ok: boolean } | null;

export async function setUserRole(_previous: RoleFormState, form: FormData): Promise<RoleFormState> {
  const admin = await requireRole("admin"); // hard rule 1: first line

  const userId = String(form.get("userId"));
  const newRole = form.get("role");
  if (!isRole(newRole)) return { ok: false, message: "Unknown role." };
  // Stops the last admin from accidentally locking everyone out.
  if (userId === admin.id) return { ok: false, message: "You can't change your own role." };

  const db = getDb();
  const [person] = await db
    .select({ role: users.role, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, userId));
  if (!person || person.deletedAt) return { ok: false, message: "This account no longer exists." };
  if (person.role === newRole) return { ok: true, message: "No change." };

  // Hard rules 4 and 5: the change and its change_log row are saved together, or not at all.
  await db.batch([
    db.update(users).set({ role: newRole }).where(eq(users.id, userId)),
    db.insert(changeLog).values({
      tableName: "users",
      recordId: userId,
      action: "update",
      oldRow: { role: person.role },
      newRow: { role: newRole },
      changedBy: admin.id,
    }),
  ]);

  revalidatePath("/dashboard/users");
  return { ok: true, message: `Role changed to ${newRole}.` };
}
