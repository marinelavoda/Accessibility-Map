// Makes an existing account an admin. Used once, for the very first admin;
// after that, admins change roles on the dashboard's "Users & roles" page.
//
//   npm run make-admin -- someone@example.com            (local database)
//   npm run make-admin -- someone@example.com --remote   (live database)
//
// The person must have signed up first. The change and its change_log row are sent
// in one command, so either both are saved or neither is.

import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const remote = args.includes("--remote");
const email = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase();

// Strict check, so the email is safe to put inside the SQL below.
if (!email || !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) {
  console.error("Usage: npm run make-admin -- someone@example.com [--remote]");
  process.exit(1);
}

const sql = `
INSERT INTO change_log (table_name, record_id, action, old_row, new_row, changed_by, changed_at)
  SELECT 'users', id, 'update', json_object('role', role), json_object('role', 'admin'), NULL, unixepoch() * 1000
  FROM users WHERE email = '${email}' AND role <> 'admin' AND deleted_at IS NULL;
UPDATE users SET role = 'admin', updated_at = unixepoch() * 1000
  WHERE email = '${email}' AND deleted_at IS NULL;
SELECT email, role FROM users WHERE email = '${email}';
`;

const result = spawnSync(
  "npx",
  ["wrangler", "d1", "execute", "DB", remote ? "--remote" : "--local", "--command", sql],
  { stdio: ["inherit", "pipe", "inherit"], encoding: "utf8" },
);
process.stdout.write(result.stdout);

if (result.status !== 0) process.exit(result.status ?? 1);
if (!result.stdout.includes(`"role": "admin"`)) {
  console.error(`\nNo account with the email ${email} was found. Sign up on the website first, then run this again.`);
  process.exit(1);
}
console.log(`\n${email} is now an admin${remote ? " on the live site" : " locally"}.`);
