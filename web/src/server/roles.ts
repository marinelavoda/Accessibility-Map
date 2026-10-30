// Each role includes the one before it: an admin can do everything a reviewer can,
// and a reviewer everything a user can (docs/decisions.md, "Users and roles").
// No imports from Next.js here, so the tests can load this file directly.

export const ROLE_ORDER = ["user", "reviewer", "admin"] as const;
export type Role = (typeof ROLE_ORDER)[number];

export function isRole(value: unknown): value is Role {
  return ROLE_ORDER.includes(value as Role);
}

/** True if someone with `role` may do something that needs `required`. */
export function hasRole(role: Role, required: Role): boolean {
  return ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf(required);
}
