// Run with `npm test`.

import assert from "node:assert/strict";
import { test } from "node:test";
import { describeChange } from "../src/lib/change-diff.ts";
import { toCsv } from "../src/server/csv.ts";

test("CSV starts with the UTF-8 marker so Excel shows ă, ț, ș correctly", () => {
  const csv = toCsv(["name"], [["Piața Marii Adunări Naționale"]]);
  assert.equal(csv, "﻿name\r\nPiața Marii Adunări Naționale\r\n");
});

test("CSV quotes cells with commas, quotes and line breaks", () => {
  const csv = toCsv(["a", "b", "c"], [['Strada 31 August, 78', 'Teatrul "Eugène Ionesco"', "line 1\nline 2"]]);
  assert.equal(csv.split("\r\n")[1], '"Strada 31 August, 78","Teatrul ""Eugène Ionesco""","line 1\nline 2"');
});

test("CSV writes empty cells, numbers, booleans and dates", () => {
  const csv = toCsv(["a", "b", "c", "d", "e"], [[null, undefined, 47.02, true, new Date("2026-10-30T12:00:00Z")]]);
  assert.equal(csv.split("\r\n")[1], ",,47.02,true,2026-10-30T12:00:00.000Z");
});

test("CSV defuses cells that Excel would run as formulas", () => {
  const csv = toCsv(["notes"], [["=HYPERLINK(\"http://evil\")"], ["+1"], ["-2"], ["@SUM(A1)"]]);
  const cells = csv.split("\r\n").slice(1, 5);
  assert.deepEqual(cells, ['"\'=HYPERLINK(""http://evil"")"', "'+1", "'-2", "'@SUM(A1)"]);
});

test("real negative numbers are not mistaken for formulas", () => {
  const csv = toCsv(["osm_id", "lng"], [[-8, -0.5]]);
  assert.equal(csv.split("\r\n")[1], "-8,-0.5");
});

test("a change lists only the fields that changed", () => {
  assert.deepEqual(describeChange({ role: "user" }, { role: "admin" }), [{ field: "role", from: "user", to: "admin" }]);
  assert.deepEqual(describeChange({ status: "pending", note: "x" }, { status: "approved", note: "x" }), [
    { field: "status", from: "pending", to: "approved" },
  ]);
});

test("a new record has no 'from', and empty values read as 'empty'", () => {
  assert.deepEqual(describeChange(null, { published_level: "accessible" }), [
    { field: "published_level", from: null, to: "accessible" },
  ]);
  assert.deepEqual(describeChange({ published_level: null }, { published_level: "partial" }), [
    { field: "published_level", from: "empty", to: "partial" },
  ]);
});

test("a field that goes from 'not there' to empty is not shown", () => {
  assert.deepEqual(describeChange({ status: "pending" }, { status: "approved", rejection_reason: null }), [
    { field: "status", from: "pending", to: "approved" },
  ]);
});
