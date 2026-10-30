// Run with `npm test`. Uses Node's built-in test runner (no extra packages).

import assert from "node:assert/strict";
import { test } from "node:test";
import { hashPassword, verifyPassword } from "../src/server/password.ts";
import { hasRole, isRole } from "../src/server/roles.ts";

test("each role includes the roles below it, and nothing above", () => {
  assert.equal(hasRole("user", "user"), true);
  assert.equal(hasRole("user", "reviewer"), false); // a plain user can't open the dashboard
  assert.equal(hasRole("user", "admin"), false);
  assert.equal(hasRole("reviewer", "user"), true);
  assert.equal(hasRole("reviewer", "reviewer"), true);
  assert.equal(hasRole("reviewer", "admin"), false); // a reviewer can't change roles
  assert.equal(hasRole("admin", "user"), true);
  assert.equal(hasRole("admin", "reviewer"), true);
  assert.equal(hasRole("admin", "admin"), true);
});

test("only the three known roles are accepted", () => {
  for (const role of ["user", "reviewer", "admin"]) assert.equal(isRole(role), true);
  for (const value of ["Admin", "superadmin", "", null, undefined, 1]) assert.equal(isRole(value), false);
});

test("a hashed password verifies, a wrong one doesn't", async () => {
  const hash = await hashPassword("correct horse battery");
  assert.match(hash, /^pbkdf2-sha256\$100000\$/);
  assert.equal(await verifyPassword({ hash, password: "correct horse battery" }), true);
  assert.equal(await verifyPassword({ hash, password: "correct horse batterY" }), false);
});

test("the same password gets a different hash each time (random salt)", async () => {
  assert.notEqual(await hashPassword("same password"), await hashPassword("same password"));
});

test("a malformed or foreign hash never verifies", async () => {
  for (const hash of ["", "nonsense", "scrypt$abc$def", "pbkdf2-sha256$100000$$"]) {
    assert.equal(await verifyPassword({ hash, password: "anything" }), false);
  }
});
