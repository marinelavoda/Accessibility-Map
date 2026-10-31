// Run with `npm test`. The Overview page's limits: urgent submissions, old ratings, percentages.

import assert from "node:assert/strict";
import { test } from "node:test";
import { daysSince, isUrgent, percent, staleCutoff, weekStart } from "../src/lib/overview.ts";

const NOW = new Date("2026-10-31T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

test("days waiting are whole days", () => {
  assert.equal(daysSince(daysAgo(0), NOW), 0);
  assert.equal(daysSince(new Date("2026-10-31T01:00:00Z"), NOW), 0);
  assert.equal(daysSince(daysAgo(3.5), NOW), 3);
  assert.equal(daysSince(daysAgo(-1), NOW), 0); // a clock slightly ahead never shows "-1 days"
});

test("submissions turn urgent after waiting more than 14 days", () => {
  assert.equal(isUrgent(null, NOW), false);
  assert.equal(isUrgent(daysAgo(14), NOW), false);
  assert.equal(isUrgent(daysAgo(14.9), NOW), false);
  assert.equal(isUrgent(daysAgo(15), NOW), true);
});

test("old ratings are older than 24 calendar months; this week is the last 7 days", () => {
  assert.equal(staleCutoff(NOW).toISOString(), "2024-10-31T12:00:00.000Z");
  assert.equal(weekStart(NOW).toISOString(), "2026-10-24T12:00:00.000Z");
});

test("percentages round down and never divide by zero", () => {
  assert.equal(percent(41, 120), 34);
  assert.equal(percent(119, 120), 99);
  assert.equal(percent(120, 120), 100);
  assert.equal(percent(0, 0), 0);
});
