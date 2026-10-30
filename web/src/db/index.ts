import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

/** The Drizzle client for the D1 database bound as `DB` in wrangler.jsonc.
 *  Call it inside a request (a page, route handler or server action), not at module load. */
export function getDb() {
  const { env } = getCloudflareContext();
  return drizzle(env.DB, { schema });
}
