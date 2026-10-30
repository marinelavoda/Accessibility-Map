// requireRole(): hard rule 1 in CLAUDE.md. Every dashboard page and server action
// calls it first, before reading or writing any data.
//
// It reads the role fresh from the database on every call (not from the cookie),
// so a role change takes effect on the person's very next click.

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getAuth } from "./auth";
import { hasRole, type Role } from "./roles";

export type CurrentUser = { id: string; name: string; email: string; role: Role };

/** The signed-in person, or null for a visitor (or a deleted account). */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;

  const [user] = await getDb()
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, session.user.id));
  if (!user || user.deletedAt) return null;

  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

/**
 * For dashboard pages and server actions.
 * Visitor -> sent to the sign-in page. Signed in without the role -> sent to /no-access.
 */
export async function requireRole(required: Role): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!hasRole(user.role, required)) redirect("/no-access");
  return user;
}
