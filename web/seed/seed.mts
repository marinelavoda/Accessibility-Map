// Sample data for LOCAL DEVELOPMENT ONLY.
//
// Run with `npm run db:seed:local`. This script writes seed/seed.sql, which wrangler then
// loads into the local D1 database. Never run seed.sql against the real (remote) database:
// it starts by deleting every row.
//
// What's real and what isn't:
// - Criteria and questions follow MOTIVAȚIE's 9-criterion form (docs/criteria-and-rules.md).
//   The Romanian wording is a draft and should be checked against their original form.
// - Places are real places in Chișinău, but coordinates are approximate and the OSM IDs are
//   negative, so they can never collide with a real OpenStreetMap import.
// - Every assessment, submission, photo and user here is INVENTED for testing.

import { writeFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Translated = { ro: string; en: string };
type Level = "accessible" | "partial" | "inaccessible";

const t = (iso: string) => Date.parse(iso);
const tr = (ro: string, en: string): Translated => ({ ro, en });

/** Turns a JS value into a SQL literal. Objects and arrays become JSON text. */
function sqlValue(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "number") return String(v);
  const text = typeof v === "string" ? v : JSON.stringify(v);
  return `'${text.replaceAll("'", "''")}'`;
}

const lines: string[] = [];
function insert(table: string, row: Record<string, unknown>) {
  const cols = Object.keys(row).map((c) => `"${c}"`).join(", ");
  const vals = Object.values(row).map(sqlValue).join(", ");
  lines.push(`INSERT INTO ${table} (${cols}) VALUES (${vals});`);
}
function section(title: string) {
  lines.push("", `-- ${title}`);
}

// ---------------------------------------------------------------------------
// Questionnaire: MOTIVAȚIE's 9 criteria
// ---------------------------------------------------------------------------

type Option = { code: string; label: Translated };
const opt = (code: string, ro: string, en: string): Option => ({ code, label: tr(ro, en) });

const ACCESSIBLE = opt("accessible", "Accesibil", "Accessible");
const INACCESSIBLE = opt("inaccessible", "Inaccesibil", "Inaccessible");
const YES = opt("yes", "Da", "Yes");
const NO = opt("no", "Nu", "No");
const WIDE = opt("wide", "Late", "Wide");
const NARROW = opt("narrow", "Înguste", "Narrow");

type CriterionDef = {
  code: string;
  name: Translated;
  group: "entry" | "inside" | "parking";
  mandatory: boolean;
  main: { prompt: Translated; options: Option[] };
  details?: { code: string; prompt: Translated; options: Option[] };
};

const CRITERIA: CriterionDef[] = [
  {
    code: "access_until_entering",
    name: tr("Accesul până la intrarea în clădire", "Access until entering the building"),
    group: "entry",
    mandatory: true,
    main: { prompt: tr("Este accesibil drumul până la intrare?", "Is the way to the entrance accessible?"), options: [ACCESSIBLE, INACCESSIBLE] },
    details: {
      code: "barriers",
      prompt: tr("Ce bariere există?", "Which barriers are there?"),
      options: [opt("curb", "Bordură", "Curb"), opt("stairs", "Scări", "Stairs"), opt("other", "Altele", "Other")],
    },
  },
  {
    code: "ramp",
    name: tr("Rampă", "Ramp"),
    group: "entry",
    mandatory: true,
    main: {
      prompt: tr("Există o rampă?", "Is there a ramp?"),
      options: [YES, NO, opt("not_needed", "Nu este necesară (intrare fără trepte)", "Not needed (step-free entrance)")],
    },
    details: {
      code: "surface",
      prompt: tr("Suprafața și dotările rampei", "Ramp surface and features"),
      options: [
        opt("pavement", "Pavaj", "Pavement"),
        opt("concrete", "Beton", "Concrete"),
        opt("wood", "Lemn", "Wood"),
        opt("metal", "Metal", "Metal"),
        opt("handrail", "Balustradă", "Handrail"),
        opt("metal_wheel_tracks", "Șine metalice pentru roți", "Metal wheel tracks"),
        opt("other", "Altele", "Other"),
      ],
    },
  },
  {
    code: "entrance_doors",
    name: tr("Ușile de la intrare", "Entrance doors"),
    group: "entry",
    mandatory: true,
    main: { prompt: tr("Cât de late sunt ușile de la intrare?", "How wide are the entrance doors?"), options: [WIDE, NARROW] },
  },
  {
    code: "interior_space",
    name: tr("Spațiul interior", "Interior space"),
    group: "inside",
    mandatory: true,
    main: { prompt: tr("Se poate circula în interior cu scaunul rulant?", "Can a wheelchair user move around inside?"), options: [ACCESSIBLE, INACCESSIBLE] },
  },
  {
    code: "adapted_toilet",
    name: tr("Toaletă adaptată", "Adapted toilet"),
    group: "inside",
    mandatory: true,
    main: {
      prompt: tr("Există o toaletă adaptată?", "Is there an adapted toilet?"),
      options: [YES, NO, opt("no_public_toilet", "Nu există toaletă publică", "No public toilet")],
    },
  },
  {
    code: "elevator",
    name: tr("Lift", "Elevator"),
    group: "inside",
    mandatory: false,
    main: { prompt: tr("Există lift?", "Is there an elevator?"), options: [YES, NO, opt("not_needed", "Nu este necesar", "Not needed")] },
  },
  {
    code: "interior_doors",
    name: tr("Ușile interioare", "Interior doors"),
    group: "inside",
    mandatory: false,
    main: { prompt: tr("Cât de late sunt ușile interioare?", "How wide are the interior doors?"), options: [WIDE, NARROW] },
  },
  {
    code: "checkout_counter",
    name: tr("Ghișeu sau casă accesibilă", "Accessible checkout counter"),
    group: "inside",
    mandatory: false,
    main: {
      prompt: tr("Există un ghișeu sau o casă la o înălțime accesibilă?", "Is there a counter or checkout at an accessible height?"),
      options: [YES, NO, opt("not_applicable", "Nu se aplică", "N/A")],
    },
  },
  {
    code: "designated_parking",
    name: tr("Parcare rezervată", "Designated parking"),
    group: "parking",
    mandatory: true,
    main: {
      prompt: tr("Există un loc de parcare marcat pentru persoane cu dizabilități?", "Is there a marked parking space for people with disabilities?"),
      options: [opt("yes", "Da (marcat)", "Yes (marked)"), opt("no", "Nu (nemarcat)", "No (unmarked)")],
    },
  },
];

type CriterionCode = (typeof CRITERIA)[number]["code"];
const critId = (code: CriterionCode) => `crit_${code}`;
const questionId = (crit: CriterionCode, q: string) => `q_${crit}_${q}`;

// ---------------------------------------------------------------------------
// Categories (OSM tags are used later by the OpenStreetMap import)
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { code: "health", name: tr("Sănătate", "Health"), icon: "heart-pulse", osmTags: ["amenity=hospital", "amenity=clinic", "amenity=doctors", "amenity=dentist", "amenity=pharmacy", "healthcare=*"] },
  { code: "public_services", name: tr("Servicii publice", "Public services"), icon: "landmark", osmTags: ["amenity=townhall", "amenity=courthouse", "amenity=police", "amenity=social_facility", "office=government"] },
  { code: "education", name: tr("Educație", "Education"), icon: "graduation-cap", osmTags: ["amenity=university", "amenity=college", "amenity=school", "amenity=kindergarten"] },
  { code: "food_drink", name: tr("Mâncare și băuturi", "Food & drink"), icon: "utensils", osmTags: ["amenity=restaurant", "amenity=cafe", "amenity=fast_food", "amenity=bar", "amenity=pub"] },
  { code: "shops", name: tr("Magazine", "Shops"), icon: "shopping-bag", osmTags: ["shop=*", "amenity=marketplace"] },
  { code: "banks_post", name: tr("Bănci și poștă", "Banks & post"), icon: "banknote", osmTags: ["amenity=bank", "amenity=post_office", "amenity=bureau_de_change"] },
  { code: "culture_leisure", name: tr("Cultură și timp liber", "Culture & leisure"), icon: "drama", osmTags: ["amenity=theatre", "amenity=cinema", "amenity=arts_centre", "amenity=library", "tourism=museum", "tourism=gallery"] },
  { code: "sports", name: tr("Sport", "Sports"), icon: "dumbbell", osmTags: ["leisure=sports_centre", "leisure=stadium", "leisure=fitness_centre", "leisure=swimming_pool"] },
  { code: "accommodation", name: tr("Cazare", "Accommodation"), icon: "bed", osmTags: ["tourism=hotel", "tourism=hostel", "tourism=guest_house"] },
  { code: "religion", name: tr("Lăcașuri de cult", "Places of worship"), icon: "church", osmTags: ["amenity=place_of_worship"] },
  { code: "transport", name: tr("Transport", "Transport"), icon: "train-front", osmTags: ["railway=station", "amenity=bus_station", "aeroway=terminal"] },
  { code: "other", name: tr("Altele", "Other"), icon: "map-pin", osmTags: [] },
] as const;

type CategoryCode = (typeof CATEGORIES)[number]["code"];
const catId = (code: CategoryCode) => `cat_${code}`;

// ---------------------------------------------------------------------------
// Users (invented; no passwords, since Better Auth isn't set up yet)
// ---------------------------------------------------------------------------

const USERS = [
  { id: "u_admin", name: "Admin (sample)", email: "admin@example.com", role: "admin" },
  { id: "u_reviewer", name: "Reviewer (sample)", email: "reviewer@example.com", role: "reviewer" },
  { id: "u_ana", name: "Ana (sample)", email: "ana@example.com", role: "user" },
  { id: "u_ion", name: "Ion (sample)", email: "ion@example.com", role: "user" },
] as const;
type UserId = (typeof USERS)[number]["id"];

// ---------------------------------------------------------------------------
// Places (real names, approximate coordinates, fake negative OSM IDs)
// ---------------------------------------------------------------------------

type PlaceDef = {
  id: string;
  name: string;
  otherNames?: string[];
  category: CategoryCode;
  lat: number;
  lng: number;
  address?: string;
  osmTag?: string;
  admin?: boolean; // added by an admin instead of imported from OSM
  status?: "active" | "hidden" | "gone_from_osm";
  // The summary copied from the current assessment (only when the publishing rule is met).
  published?: { level: Level; parking: boolean | null; verifiedAt: string };
};

const PLACES: PlaceDef[] = [
  { id: "p_primaria", name: "Primăria Municipiului Chișinău", category: "public_services", lat: 47.0262, lng: 28.8355, address: "bd. Ștefan cel Mare și Sfânt 83", osmTag: "amenity=townhall",
    published: { level: "accessible", parking: true, verifiedAt: "2026-03-15T10:00:00Z" } },
  { id: "p_teatru", name: "Teatrul Național „Mihai Eminescu”", category: "culture_leisure", lat: 47.0257, lng: 28.8372, address: "bd. Ștefan cel Mare și Sfânt 79", osmTag: "amenity=theatre",
    published: { level: "partial", parking: false, verifiedAt: "2026-09-12T14:00:00Z" } },
  { id: "p_gara", name: "Gara Feroviară Chișinău", otherNames: ["Железнодорожный вокзал"], category: "transport", lat: 47.0007, lng: 28.8555, address: "Piața Gării 1", osmTag: "railway=station",
    published: { level: "inaccessible", parking: null, verifiedAt: "2026-05-20T09:00:00Z" } },
  { id: "p_catedrala", name: "Catedrala Mitropolitană „Nașterea Domnului”", otherNames: ["Кафедральный собор"], category: "religion", lat: 47.0248, lng: 28.8321, osmTag: "amenity=place_of_worship",
    published: { level: "inaccessible", parking: null, verifiedAt: "2026-04-02T09:00:00Z" } },
  { id: "p_farmacia", name: "Farmacia Familiei", category: "health", lat: 47.0236, lng: 28.8318, osmTag: "amenity=pharmacy",
    published: { level: "accessible", parking: false, verifiedAt: "2026-04-10T09:00:00Z" } },
  { id: "p_usm", name: "Universitatea de Stat din Moldova", otherNames: ["USM"], category: "education", lat: 47.0198, lng: 28.8219, address: "str. Alexei Mateevici 60", osmTag: "amenity=university" },
  { id: "p_tucano", name: "Tucano Coffee", category: "food_drink", lat: 47.0244, lng: 28.8302, osmTag: "amenity=cafe" },
  { id: "p_andys", name: "Andy's Pizza", category: "food_drink", lat: 47.0229, lng: 28.8381, osmTag: "amenity=restaurant" },
  { id: "p_scr", name: "Spitalul Clinic Republican „Timofei Moșneaga”", otherNames: ["Республиканская клиническая больница", "Republicana"], category: "health", lat: 47.0050, lng: 28.8225, osmTag: "amenity=hospital" },
  { id: "p_muzeu", name: "Muzeul Național de Istorie a Moldovei", category: "culture_leisure", lat: 47.0244, lng: 28.8268, address: "str. 31 August 1989, 121A", osmTag: "tourism=museum" },
  { id: "p_biblioteca", name: "Biblioteca Națională a Republicii Moldova", category: "culture_leisure", lat: 47.0215, lng: 28.8318, osmTag: "amenity=library" },
  { id: "p_utm", name: "Universitatea Tehnică a Moldovei", otherNames: ["UTM"], category: "education", lat: 47.0231, lng: 28.8359, osmTag: "amenity=university" },
  { id: "p_malldova", name: "MallDova", otherNames: ["Mall Dova"], category: "shops", lat: 46.9978, lng: 28.8566, osmTag: "shop=mall" },
  { id: "p_piata", name: "Piața Centrală", otherNames: ["Центральный рынок"], category: "shops", lat: 47.0196, lng: 28.8412, osmTag: "amenity=marketplace" },
  { id: "p_posta", name: "Poșta Moldovei – Oficiul Poștal Central", category: "banks_post", lat: 47.0241, lng: 28.8350, osmTag: "amenity=post_office" },
  { id: "p_zimbru", name: "Stadionul Zimbru", category: "sports", lat: 46.9944, lng: 28.8412, osmTag: "leisure=stadium" },
  { id: "p_cosmos", name: "Hotel Cosmos", category: "accommodation", lat: 47.0160, lng: 28.8228, osmTag: "tourism=hotel" },
  { id: "p_autogara", name: "Autogara Centrală", category: "transport", lat: 47.0182, lng: 28.8402, osmTag: "amenity=bus_station", status: "hidden" },
  { id: "p_primaria_botanica", name: "Primăria Sectorului Botanica", category: "public_services", lat: 46.9935, lng: 28.8610, admin: true },
];

// ---------------------------------------------------------------------------
// Assessments and submissions (all invented)
// ---------------------------------------------------------------------------

/** One assessed criterion. `main` is the main answer's option code. */
type Result = { c: CriterionCode; main: string; details?: string[]; notes?: string; photos?: number };

type AssessmentDef = {
  id: string;
  place: string;
  origin: "motivatie_import" | "user_submission" | "admin_edit";
  basedOn?: string;
  overall: Level | null;
  current: boolean;
  verifiedAt?: string;
  createdAt: string;
  /** false = imported with levels only, no detailed answers (allowed by decision R28). */
  withAnswers?: boolean;
  results: Result[];
};

type SubmissionDef = {
  id: string;
  assessment: string;
  kind: "first_assessment" | "update";
  status: "pending" | "approved" | "rejected";
  by: UserId;
  at: string;
  reviewing?: { by: UserId; since: string };
  decision?: { by: UserId; at: string; reason?: string };
  // Reason and note codes are listed in docs/criteria-and-rules.md ("Notes for the reviewer").
  suggestion: { level: Level; reasons: string[]; notes: string[] };
};

const ASSESSMENTS: AssessmentDef[] = [
  // Imported from MOTIVAȚIE with levels only: published as accessible.
  { id: "a_primaria", place: "p_primaria", origin: "motivatie_import", overall: "accessible", current: true, verifiedAt: "2026-03-15T10:00:00Z", createdAt: "2026-03-15T10:00:00Z", withAnswers: false,
    results: [
      { c: "access_until_entering", main: "accessible" }, { c: "ramp", main: "not_needed" }, { c: "entrance_doors", main: "wide" },
      { c: "interior_space", main: "accessible" }, { c: "adapted_toilet", main: "yes" }, { c: "elevator", main: "yes" },
      { c: "interior_doors", main: "wide" }, { c: "checkout_counter", main: "yes" }, { c: "designated_parking", main: "yes" },
    ] },
  // A user's submission, approved: no adapted toilet -> partially accessible.
  { id: "a_teatru", place: "p_teatru", origin: "user_submission", overall: "partial", current: true, verifiedAt: "2026-09-12T14:00:00Z", createdAt: "2026-09-10T18:30:00Z",
    results: [
      { c: "access_until_entering", main: "accessible", photos: 1 }, { c: "ramp", main: "not_needed" }, { c: "entrance_doors", main: "wide", photos: 1 },
      { c: "interior_space", main: "accessible", photos: 2 }, { c: "adapted_toilet", main: "no", notes: "Toaleta este la subsol, fără lift.", photos: 1 },
      { c: "elevator", main: "yes", photos: 1 }, { c: "designated_parking", main: "no" },
    ] },
  // Imported, entry path only: stairs and no ramp -> inaccessible (publishable with entry path alone).
  { id: "a_gara", place: "p_gara", origin: "motivatie_import", overall: "inaccessible", current: true, verifiedAt: "2026-05-20T09:00:00Z", createdAt: "2026-05-20T09:00:00Z",
    results: [
      { c: "access_until_entering", main: "inaccessible", details: ["stairs"] }, { c: "ramp", main: "no" }, { c: "entrance_doors", main: "wide" },
    ] },
  // Imported: "other" barrier -> inaccessible.
  { id: "a_catedrala", place: "p_catedrala", origin: "motivatie_import", overall: "inaccessible", current: true, verifiedAt: "2026-04-02T09:00:00Z", createdAt: "2026-04-02T09:00:00Z",
    results: [
      { c: "access_until_entering", main: "inaccessible", details: ["other"], notes: "Alee cu pietriș și pantă abruptă până la intrare." },
      { c: "ramp", main: "no" }, { c: "entrance_doors", main: "wide" },
    ] },
  // Imported, full: accessible; no public toilet and no elevator needed don't count against it.
  { id: "a_farmacia_v1", place: "p_farmacia", origin: "motivatie_import", overall: "accessible", current: true, verifiedAt: "2026-04-10T09:00:00Z", createdAt: "2026-04-10T09:00:00Z",
    results: [
      { c: "access_until_entering", main: "accessible" }, { c: "ramp", main: "not_needed" }, { c: "entrance_doors", main: "wide", notes: "90 cm" },
      { c: "interior_space", main: "accessible" }, { c: "adapted_toilet", main: "no_public_toilet" }, { c: "elevator", main: "not_needed" },
      { c: "checkout_counter", main: "yes" }, { c: "designated_parking", main: "no" },
    ] },
  // Pending UPDATE to the pharmacy: only the entrance doors changed.
  { id: "a_farmacia_update", place: "p_farmacia", origin: "user_submission", basedOn: "a_farmacia_v1", overall: null, current: false, createdAt: "2026-10-28T16:20:00Z",
    results: [{ c: "entrance_doors", main: "narrow", notes: "După renovare ușa are cam 70 cm.", photos: 1 }] },
  // Approved, but only the entry path, all positive: NOT publishable yet -> stays "Not yet rated".
  { id: "a_usm", place: "p_usm", origin: "user_submission", overall: null, current: true, verifiedAt: "2026-10-05T11:00:00Z", createdAt: "2026-10-03T08:15:00Z",
    results: [
      { c: "access_until_entering", main: "accessible", photos: 1 }, { c: "ramp", main: "not_needed" }, { c: "entrance_doors", main: "wide", photos: 1 },
    ] },
  // Pending first assessment: narrow interior doors -> partial.
  { id: "a_tucano", place: "p_tucano", origin: "user_submission", overall: null, current: false, createdAt: "2026-10-29T12:40:00Z",
    results: [
      { c: "access_until_entering", main: "accessible", photos: 1 }, { c: "ramp", main: "not_needed" }, { c: "entrance_doors", main: "wide", photos: 1 },
      { c: "interior_space", main: "accessible", photos: 1 }, { c: "adapted_toilet", main: "yes", photos: 2 },
      { c: "interior_doors", main: "narrow", notes: "Ușa spre terasă e îngustă.", photos: 1 }, { c: "designated_parking", main: "no" },
    ] },
  // Pending first assessment: stairs, but a ramp with metal wheel tracks -> accessible, with reviewer notes.
  { id: "a_scr", place: "p_scr", origin: "user_submission", overall: null, current: false, createdAt: "2026-10-29T17:05:00Z",
    results: [
      { c: "access_until_entering", main: "inaccessible", details: ["stairs"], photos: 1 },
      { c: "ramp", main: "yes", details: ["concrete", "handrail", "metal_wheel_tracks"], photos: 3 },
      { c: "entrance_doors", main: "wide", photos: 1 }, { c: "interior_space", main: "accessible", photos: 1 },
      { c: "adapted_toilet", main: "yes", photos: 1 }, { c: "elevator", main: "yes", photos: 1 }, { c: "designated_parking", main: "yes", photos: 1 },
    ] },
  // Rejected first assessment.
  { id: "a_andys", place: "p_andys", origin: "user_submission", overall: null, current: false, createdAt: "2026-10-20T19:00:00Z",
    results: [
      { c: "access_until_entering", main: "accessible", photos: 1 }, { c: "ramp", main: "not_needed" }, { c: "entrance_doors", main: "wide", photos: 1 },
    ] },
];

const SUBMISSIONS: SubmissionDef[] = [
  { id: "s_teatru", assessment: "a_teatru", kind: "first_assessment", status: "approved", by: "u_ana", at: "2026-09-10T18:30:00Z",
    decision: { by: "u_reviewer", at: "2026-09-12T14:00:00Z" },
    suggestion: { level: "partial", reasons: ["no_adapted_toilet"], notes: ["no_designated_parking"] } },
  { id: "s_usm", assessment: "a_usm", kind: "first_assessment", status: "approved", by: "u_ion", at: "2026-10-03T08:15:00Z",
    decision: { by: "u_reviewer", at: "2026-10-05T11:00:00Z" },
    suggestion: { level: "accessible", reasons: [], notes: ["not_enough_to_publish"] } },
  { id: "s_farmacia_update", assessment: "a_farmacia_update", kind: "update", status: "pending", by: "u_ana", at: "2026-10-28T16:20:00Z",
    reviewing: { by: "u_reviewer", since: "2026-10-30T09:55:00Z" },
    suggestion: { level: "inaccessible", reasons: ["narrow_entrance_doors"], notes: ["no_designated_parking"] } },
  { id: "s_tucano", assessment: "a_tucano", kind: "first_assessment", status: "pending", by: "u_ion", at: "2026-10-29T12:40:00Z",
    suggestion: { level: "partial", reasons: ["narrow_interior_doors"], notes: ["no_designated_parking"] } },
  { id: "s_scr", assessment: "a_scr", kind: "first_assessment", status: "pending", by: "u_ana", at: "2026-10-29T17:05:00Z",
    suggestion: { level: "accessible", reasons: [], notes: ["ramp_makes_entrance_passable", "ramp_metal_wheel_tracks"] } },
  { id: "s_andys", assessment: "a_andys", kind: "first_assessment", status: "rejected", by: "u_ion", at: "2026-10-20T19:00:00Z",
    decision: { by: "u_reviewer", at: "2026-10-22T10:30:00Z", reason: "Fotografiile arată o altă clădire." },
    suggestion: { level: "accessible", reasons: [], notes: ["not_enough_to_publish"] } },
];

// ---------------------------------------------------------------------------
// Self-check: the sample data must follow the publishing rule
// ---------------------------------------------------------------------------

const NOT_APPLICABLE = ["not_needed", "no_public_toilet", "not_applicable"];
const POSITIVE = ["accessible", "yes", "wide"];

/** A criterion result's level comes from its main answer. */
function resultLevel(main: string) {
  if (POSITIVE.includes(main)) return "accessible";
  if (NOT_APPLICABLE.includes(main)) return "not_applicable";
  return "inaccessible";
}

function isPublishable(results: Result[], level: Level) {
  const known = new Set(results.map((r) => r.c));
  const entryPath: CriterionCode[] = ["access_until_entering", "ramp", "entrance_doors"];
  const mandatory = CRITERIA.filter((c) => c.mandatory).map((c) => c.code);
  const needed = level === "inaccessible" ? entryPath : mandatory;
  return needed.every((c) => known.has(c));
}

for (const place of PLACES) {
  const current = ASSESSMENTS.find((a) => a.place === place.id && a.current);
  const pub = place.published;
  if (pub) {
    if (!current || current.overall !== pub.level || !isPublishable(current.results, pub.level)) {
      throw new Error(`${place.id}: published level doesn't match a publishable current assessment`);
    }
    const parking = current.results.find((r) => r.c === "designated_parking");
    if ((parking ? parking.main === "yes" : null) !== pub.parking) {
      throw new Error(`${place.id}: has_designated_parking doesn't match the current assessment`);
    }
  } else if (current?.overall && isPublishable(current.results, current.overall)) {
    throw new Error(`${place.id}: current assessment is publishable but the place isn't published`);
  }
}

// ---------------------------------------------------------------------------
// Write the SQL
// ---------------------------------------------------------------------------

lines.push(
  "-- GENERATED by seed/seed.mts. Edit that file, then run `npm run db:seed:local`.",
  "-- LOCAL DEVELOPMENT ONLY: this deletes every row first.",
);

section("Start from empty tables (children before parents)");
for (const table of [
  "change_log", "search_events", "score_suggestions", "submissions", "photos", "answers",
  "criterion_results", "assessments", "places", "questions", "criteria", "categories",
  "sessions", "accounts", "verifications", "users",
]) {
  lines.push(`DELETE FROM ${table};`);
}

const SEEDED_AT = t("2026-03-01T00:00:00Z");

section("Users");
for (const u of USERS) insert("users", { ...u, email_verified: true, created_at: SEEDED_AT, updated_at: SEEDED_AT });

section("Categories");
CATEGORIES.forEach((c, i) =>
  insert("categories", { id: catId(c.code), code: c.code, name: c.name, icon: c.icon, osm_tags: c.osmTags, display_order: i + 1, created_at: SEEDED_AT }),
);

section("Criteria and questions");
CRITERIA.forEach((c, i) => {
  insert("criteria", { id: critId(c.code), code: c.code, name: c.name, group: c.group, is_mandatory: c.mandatory, display_order: i + 1, is_active: true, created_at: SEEDED_AT });
  const questions = [
    { code: "main", prompt: c.main.prompt, type: "choice", options: c.main.options, is_main: true, is_required: true },
    ...(c.details ? [{ code: c.details.code, prompt: c.details.prompt, type: "checkboxes", options: c.details.options, is_main: false, is_required: false }] : []),
    { code: "notes", prompt: tr("Observații", "Notes"), type: "text", options: null, is_main: false, is_required: false },
  ];
  questions.forEach((q, j) =>
    insert("questions", { id: questionId(c.code, q.code), criterion_id: critId(c.code), ...q, display_order: j + 1, is_active: true, created_at: SEEDED_AT }),
  );
});

section("Places");
PLACES.forEach((p, i) => {
  insert("places", {
    id: p.id,
    source: p.admin ? "admin" : "osm",
    osm_type: p.admin ? null : "node",
    osm_id: p.admin ? null : -(i + 1),
    osm_tag: p.osmTag ?? null,
    osm_synced_at: p.admin ? null : SEEDED_AT,
    name: p.name,
    other_names: p.otherNames ?? null,
    category_id: catId(p.category),
    lat: p.lat,
    lng: p.lng,
    address: p.address ?? null,
    status: p.status ?? "active",
    published_level: p.published?.level ?? null,
    has_designated_parking: p.published?.parking ?? null,
    last_verified_at: p.published ? t(p.published.verifiedAt) : null,
    created_at: SEEDED_AT,
    updated_at: p.published ? t(p.published.verifiedAt) : SEEDED_AT,
  });
});

section("Assessments, criterion results, answers and photos");
for (const a of ASSESSMENTS) {
  insert("assessments", {
    id: a.id, place_id: a.place, origin: a.origin, based_on_id: a.basedOn ?? null, overall_level: a.overall,
    is_current: a.current, verified_at: a.verifiedAt ? t(a.verifiedAt) : null, created_at: t(a.createdAt),
  });
  const uploader = SUBMISSIONS.find((s) => s.assessment === a.id)?.by ?? null;
  for (const r of a.results) {
    const resultId = `${a.id}__${r.c}`;
    insert("criterion_results", { id: resultId, assessment_id: a.id, criterion_id: critId(r.c), level: resultLevel(r.main), created_at: t(a.createdAt) });
    if (a.withAnswers !== false) {
      const crit = CRITERIA.find((c) => c.code === r.c)!;
      insert("answers", { id: `${resultId}__main`, criterion_result_id: resultId, question_id: questionId(r.c, "main"), value: JSON.stringify(r.main) });
      if (r.details && crit.details) {
        insert("answers", { id: `${resultId}__${crit.details.code}`, criterion_result_id: resultId, question_id: questionId(r.c, crit.details.code), value: JSON.stringify(r.details) });
      }
      if (r.notes) insert("answers", { id: `${resultId}__notes`, criterion_result_id: resultId, question_id: questionId(r.c, "notes"), value: JSON.stringify(r.notes) });
    }
    for (let n = 1; n <= (r.photos ?? 0); n++) {
      // The R2 keys point to files that don't exist yet: there's no photo storage in local dev.
      insert("photos", { id: `${resultId}__photo${n}`, criterion_result_id: resultId, r2_key: `seed/${a.id}/${r.c}-${n}.jpg`, position: n, uploaded_by: uploader, created_at: t(a.createdAt) });
    }
  }
}

section("Submissions and score suggestions");
for (const s of SUBMISSIONS) {
  insert("submissions", {
    id: s.id, assessment_id: s.assessment, kind: s.kind, status: s.status, submitted_by: s.by, submitted_at: t(s.at),
    reviewing_by: s.reviewing?.by ?? null, reviewing_since: s.reviewing ? t(s.reviewing.since) : null,
    reviewed_by: s.decision?.by ?? null, reviewed_at: s.decision ? t(s.decision.at) : null,
    rejection_reason: s.decision?.reason ?? null, edited_by_reviewer: false, photos_deleted_at: null,
  });
  insert("score_suggestions", {
    id: `ss_${s.id}`, submission_id: s.id, strategy: "rules", model_version: null, level: s.suggestion.level,
    explanation: { reasons: s.suggestion.reasons, notes: s.suggestion.notes }, created_at: t(s.at),
  });
}

section("Change log (a few examples of what the approval step writes)");
const log = (table: string, record: string, action: string, oldRow: unknown, newRow: unknown, by: UserId | null, at: string) =>
  insert("change_log", { table_name: table, record_id: record, action, old_row: oldRow, new_row: newRow, changed_by: by, changed_at: t(at) });

for (const a of ASSESSMENTS.filter((a) => a.origin === "motivatie_import")) {
  log("assessments", a.id, "insert", null, { place_id: a.place, overall_level: a.overall, is_current: true }, null, a.createdAt);
}
for (const s of SUBMISSIONS.filter((s) => s.decision)) {
  const d = s.decision!;
  log("submissions", s.id, "update", { status: "pending" }, { status: s.status, rejection_reason: d.reason ?? null }, d.by, d.at);
  if (s.status === "approved") {
    const a = ASSESSMENTS.find((x) => x.id === s.assessment)!;
    log("assessments", a.id, "update", { is_current: false }, { is_current: true }, d.by, d.at);
    const place = PLACES.find((p) => p.id === a.place)!;
    if (place.published) {
      log("places", place.id, "update", { published_level: null }, { published_level: place.published.level, has_designated_parking: place.published.parking }, d.by, d.at);
    }
  }
}

writeFileSync(new URL("./seed.sql", import.meta.url), lines.join("\n") + "\n");
console.log(`Wrote seed/seed.sql (${lines.filter((l) => l.startsWith("INSERT")).length} rows)`);
