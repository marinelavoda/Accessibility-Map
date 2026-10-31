// Run with `npm test`. The checks behind "Add a place" / "Edit place".

import assert from "node:assert/strict";
import { test } from "node:test";
import { changedFields, nearbyBox, parsePlaceInput, whyNotDeletable } from "../src/lib/place-input.ts";
import { toCandidate } from "../src/server/nominatim.ts";

const CATEGORIES = ["cat_health", "cat_shops"];
const valid = {
  name: "  Farmacia Familiei ",
  otherNames: "Аптека\n\n  Farmacia Familiei\nАптека",
  categoryId: "cat_health",
  lat: "47,0262",
  lng: "28.8355",
  address: "",
};

test("a valid place is cleaned up: trimmed, decimal comma, duplicate and blank names dropped", () => {
  const result = parsePlaceInput(valid, CATEGORIES);
  assert.deepEqual(result, {
    ok: true,
    value: { name: "Farmacia Familiei", otherNames: ["Аптека"], categoryId: "cat_health", lat: 47.0262, lng: 28.8355, address: null },
  });
});

test("missing name, unknown category and bad coordinates are reported per field", () => {
  const result = parsePlaceInput({ ...valid, name: " ", categoryId: "cat_made_up", lat: "47.02abc" }, CATEGORIES);
  assert.equal(result.ok, false);
  assert.deepEqual(Object.keys(!result.ok ? result.errors : {}).sort(), ["categoryId", "location", "name"]);
});

test("swapped latitude and longitude are caught (outside Moldova)", () => {
  const result = parsePlaceInput({ ...valid, lat: "28.8355", lng: "47.0262" }, CATEGORIES);
  assert.equal(result.ok, false);
  assert.match(!result.ok ? result.errors.location : "", /outside Moldova/);
});

test("form fields that aren't text (e.g. a sneaked-in file) count as empty", () => {
  const result = parsePlaceInput({ ...valid, name: { evil: true } }, CATEGORIES);
  assert.equal(result.ok, false);
});

test("the change log gets only the fields that changed", () => {
  const before = { name: "A", otherNames: ["x"], address: null, lat: 47 };
  assert.deepEqual(changedFields(before, { name: "A", otherNames: ["x", "y"], address: null, lat: 47 }), {
    oldRow: { otherNames: ["x"] },
    newRow: { otherNames: ["x", "y"] },
    changed: true,
  });
  assert.equal(changedFields(before, { name: "A" }).changed, false);
});

test("the nearby box is about 100 m each way around the point", () => {
  const box = nearbyBox(47.0262, 28.8355);
  const metresNorth = (box.maxLat - 47.0262) * 111_000;
  const metresEast = (box.maxLng - 28.8355) * 111_000 * Math.cos((47 * Math.PI) / 180);
  assert.ok(metresNorth > 90 && metresNorth < 110, `north: ${metresNorth}`);
  assert.ok(metresEast > 90 && metresEast < 110, `east: ${metresEast}`);
});

test("only admin-added places without assessments can be deleted", () => {
  assert.equal(whyNotDeletable("admin", 0), null);
  assert.match(whyNotDeletable("admin", 1)!, /has assessments/);
  assert.match(whyNotDeletable("osm", 0)!, /OpenStreetMap/);
});

test("a Nominatim result becomes a short street address and rounded coordinates", () => {
  const candidate = toCandidate({
    lat: "47.02279051234",
    lon: "28.8345816",
    name: "Primăria Municipiului Chișinău",
    display_name: "Primăria Municipiului Chișinău, 83, Bulevardul Ștefan cel Mare și Sfânt, Chișinău, Moldova",
    address: { house_number: "83", road: "Bulevardul Ștefan cel Mare și Sfânt", city: "Chișinău" },
  });
  assert.deepEqual(
    { name: candidate.name, address: candidate.address, lat: candidate.lat, lng: candidate.lng },
    { name: "Primăria Municipiului Chișinău", address: "Bulevardul Ștefan cel Mare și Sfânt 83", lat: 47.022791, lng: 28.834582 },
  );
  assert.equal(toCandidate({ lat: "47", lon: "28.8", name: "", display_name: "Centru", address: {} }).address, null);
});
