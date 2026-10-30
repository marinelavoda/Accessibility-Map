// Better Auth's own endpoints: /api/auth/sign-in/email, /api/auth/sign-up/email,
// /api/auth/sign-out, /api/auth/callback/google, ...
// These are how you sign in, so they can't call requireRole(); Better Auth checks
// passwords and sessions itself, and they never return places or assessments.

import { getAuth } from "@/server/auth";

const handle = (request: Request) => getAuth().handler(request);

export { handle as GET, handle as POST };
