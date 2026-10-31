// Run with `npm test`. The Places list's search, filters and paging.

import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePlaceFilters, placeListHref, toSearchQuery } from "../src/lib/place-filters.ts";

test("an empty address bar means: no filters, oldest-verified first, page 1", () => {
  assert.deepEqual(parsePlaceFilters({}), { q: "", category: null, level: null, status: null, verified: null, sort: "overdue", page: 1 });
});

test("filters are read from the address bar; unknown values are ignored", () => {
  const f = parsePlaceFilters({ q: " farmacia ", level: "unrated", status: "deleted", verified: "new", sort: "drop table", page: "3" });
  assert.deepEqual(f, { q: "farmacia", category: null, level: "unrated", status: null, verified: null, sort: "overdue", page: 3 });
  assert.equal(parsePlaceFilters({ verified: "old" }).verified, "old");
  assert.equal(parsePlaceFilters({ page: "-2" }).page, 1);
  assert.equal(parsePlaceFilters({ page: "1.5" }).page, 1);
  assert.equal(parsePlaceFilters({ level: ["accessible", "partial"] }).level, "accessible");
});

test("links keep the filters and leave out the defaults", () => {
  const f = parsePlaceFilters({ q: "gara", level: "inaccessible" });
  assert.equal(placeListHref(f, { page: 2 }), "/dashboard/places?q=gara&level=inaccessible&page=2");
  assert.equal(placeListHref(parsePlaceFilters({})), "/dashboard/places");
  assert.equal(placeListHref(parsePlaceFilters({ status: "active", verified: "old" })), "/dashboard/places?status=active&verified=old");
});

test("search words become prefix matches, and operators or quotes can't break the query", () => {
  assert.equal(toSearchQuery("farm fam"), '"farm"* "fam"*');
  assert.equal(toSearchQuery('Teatrul "Mihai" OR x*'), '"Teatrul"* "Mihai"* "OR"* "x"*');
  assert.equal(toSearchQuery("Ștefan cel Mare"), '"Ștefan"* "cel"* "Mare"*');
  assert.equal(toSearchQuery("Кафедральный"), '"Кафедральный"*');
  assert.equal(toSearchQuery(' " * - '), null);
});
