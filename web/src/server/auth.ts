// Better Auth setup: who you are (authentication).
// What you may do (authorization) is decided by requireRole() in ./require-role.ts.
//
// Settings come from environment variables:
//   locally   -> web/.dev.vars (never committed; copy .dev.vars.example)
//   live      -> `wrangler secret put <NAME>` (secrets) and "vars" in wrangler.jsonc
//
// The database binding only exists while a request is being handled, so the auth
// object is created inside each request by getAuth() instead of once at startup.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { hashPassword, verifyPassword } from "./password";

export function getAuth() {
  const { env } = getCloudflareContext();
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(), {
      provider: "sqlite",
      usePlural: true, // our tables are "users", "sessions", ... (see schema.ts)
      schema,
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      // Lighter hashing that fits the Workers free plan; see ./password.ts.
      password: { hash: hashPassword, verify: verifyPassword },
    },
    // "Sign in with Google" switches on once both Google settings exist.
    socialProviders:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
        : {},
    user: {
      additionalFields: {
        // input: false = a person can't choose their own role or deletion date when signing up.
        role: { type: "string", defaultValue: "user", input: false },
        deletedAt: { type: "date", required: false, input: false },
      },
    },
    advanced: {
      // Same kind of IDs as the rest of the database (schema.ts conventions).
      database: { generateId: () => crypto.randomUUID() },
    },
    telemetry: { enabled: false },
  });
}

export function isGoogleSignInEnabled(): boolean {
  const { env } = getCloudflareContext();
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}
