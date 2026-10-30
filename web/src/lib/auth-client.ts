// The browser side of Better Auth: used by the sign-in / sign-up forms and the sign-out button.
// It talks to /api/auth/... on the same site, so it needs no settings.

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
