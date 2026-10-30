"""Applies both migrations to an empty SQLite database, loads a little valid data,
then tries to break each rule. Every 'refused' line is the database protecting itself."""
import sqlite3, json, sys, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys = ON")  # D1 enforces foreign keys by default
for f in sorted((root / "drizzle").glob("*.sql")):
    db.executescript(f.read_text().replace("--> statement-breakpoint", ""))

ok_count = fail_count = 0
def ok(label, sql, *args):
    global ok_count, fail_count
    try:
        db.execute(sql, args); ok_count += 1; print("  allowed  ", label)
    except sqlite3.Error as e:
        fail_count += 1; print("  PROBLEM  ", label, "->", e)
def refused(label, sql, *args):
    global ok_count, fail_count
    try:
        db.execute(sql, args); fail_count += 1; print("  PROBLEM  ", label, "was accepted")
    except sqlite3.IntegrityError as e:
        ok_count += 1; print("  refused  ", label, "->", str(e).split(":")[-1].strip())

T = 1761800000000
print("Valid data")
ok("user", "insert into users (id,name,email,role,created_at,updated_at) values ('u1','Ana','ana@x.md','user',?,?)", T, T)
ok("reviewer", "insert into users (id,name,email,role,created_at,updated_at) values ('r1','Tudor','t@x.md','reviewer',?,?)", T, T)
ok("category", "insert into categories values ('c1','health',?, 'cross', ?, 1, ?)", json.dumps({"ro":"Sănătate","en":"Health"}), json.dumps(["amenity=pharmacy"]), T)
ok("OSM place", "insert into places (id,source,osm_type,osm_id,name,other_names,category_id,lat,lng,status,created_at,updated_at) values ('p1','osm','node',123,'Spitalul Clinic Republican',?, 'c1',47.03,28.83,'active',?,?)", json.dumps(["Республиканская больница","Republicana"]), T, T)
ok("admin place", "insert into places (id,source,name,category_id,lat,lng,status,created_at,updated_at) values ('p2','admin','Primăria Sectorului Botanica','c1',47.0,28.86,'active',?,?)", T, T)
ok("criterion", "insert into criteria values ('k1','entrance_doors',?, 'entry', 1, 1, 1, ?)", json.dumps({"ro":"Uși","en":"Entrance doors"}), T)
ok("main question", "insert into questions values ('q1','k1','main',?, 'choice',?, 1, 1, 1, 1, ?)", json.dumps({"ro":"?","en":"Wide or narrow?"}), json.dumps([{"code":"wide","label":{"ro":"Late","en":"Wide"}}]), T)
ok("notes question", "insert into questions values ('q2','k1','notes',?, 'text',NULL, 0, 0, 2, 1, ?)", json.dumps({"ro":"Note","en":"Notes"}), T)
ok("current assessment", "insert into assessments values ('a1','p1','motivatie_import',NULL,'accessible',1,?,?)", T, T)
ok("pending assessment", "insert into assessments values ('a2','p1','user_submission','a1',NULL,0,NULL,?)", T)
ok("criterion result", "insert into criterion_results values ('cr1','a2','k1','accessible',?)", T)
ok("answer (choice)", "insert into answers values ('an1','cr1','q1','\"wide\"')")
ok("answer (text)", "insert into answers values ('an2','cr1','q2','\"80 cm\"')")
for i in (1, 2, 3):
    ok(f"photo {i}", "insert into photos values (?, 'cr1', ?, ?, 'u1', ?)", f"ph{i}", f"pending/x{i}.jpg", i, T)
ok("submission", "insert into submissions (id,assessment_id,kind,status,submitted_by,submitted_at,edited_by_reviewer) values ('s1','a2','update','pending','u1',?,0)", T)
ok("suggestion", "insert into score_suggestions values ('ss1','s1','rules',NULL,'accessible','{}',?)", T)

print("\nBroken data")
refused("role 'superadmin'", "insert into users (id,name,email,role,created_at,updated_at) values ('u9','X','x@x','superadmin',?,?)", T, T)
refused("same email twice", "insert into users (id,name,email,role,created_at,updated_at) values ('u8','X','ana@x.md','user',?,?)", T, T)
refused("OSM place without OSM id", "insert into places (id,source,name,category_id,lat,lng,status,created_at,updated_at) values ('p9','osm','X','c1',47,28,'active',?,?)", T, T)
refused("same OSM place twice", "insert into places (id,source,osm_type,osm_id,name,category_id,lat,lng,status,created_at,updated_at) values ('p8','osm','node',123,'X','c1',47,28,'active',?,?)", T, T)
refused("unknown category", "insert into places (id,source,name,category_id,lat,lng,status,created_at,updated_at) values ('p7','admin','X','nope',47,28,'active',?,?)", T, T)
refused("latitude 200", "insert into places (id,source,name,category_id,lat,lng,status,created_at,updated_at) values ('p6','admin','X','c1',200,28,'active',?,?)", T, T)
refused("second main question", "insert into questions values ('q3','k1','main2',?, 'choice','[]', 1, 1, 3, 1, ?)", '{}', T)
refused("choice question without options", "insert into questions values ('q4','k1','x',?, 'choice',NULL, 0, 1, 4, 1, ?)", '{}', T)
refused("two current assessments", "insert into assessments values ('a3','p1','admin_edit',NULL,'partial',1,?,?)", T, T)
refused("current but never verified", "insert into assessments values ('a4','p2','admin_edit',NULL,NULL,1,NULL,?)", T)
refused("same criterion twice in one assessment", "insert into criterion_results values ('cr2','a2','k1','partial',?)", T)
refused("4th photo", "insert into photos values ('ph4','cr1','pending/x4.jpg', 4, 'u1', ?)", T)
refused("2 photos in same position", "insert into photos values ('ph5','cr1','pending/x5.jpg', 2, 'u1', ?)", T)
refused("answer that isn't JSON", "insert into answers values ('an3','cr1','q2','not json')")
refused("two submissions for one assessment", "insert into submissions (id,assessment_id,kind,status,submitted_by,submitted_at,edited_by_reviewer) values ('s2','a2','update','pending','u1',?,0)", T)
refused("approved without a reviewer", "update submissions set status='approved' where id='s1'")
refused("rejected without a reason", "update submissions set status='rejected', reviewed_by='r1', reviewed_at=? where id='s1'", T)
ok("rejected with a reason", "update submissions set status='rejected', reviewed_by='r1', reviewed_at=?, rejection_reason='Photo does not match' where id='s1'", T)

print("\nCascades")
db.execute("delete from assessments where id='a2'") if False else None
n_before = db.execute("select count(*) from photos").fetchone()[0]
db.execute("delete from submissions where id='s1'"); db.execute("delete from assessments where id='a2'")
left = [db.execute(f"select count(*) from {t}").fetchone()[0] for t in ("criterion_results","answers","photos","score_suggestions")]
print("  deleting a rejected submission + its assessment removes results/answers/photos/suggestions:", "yes" if left == [0,0,0,0] else f"NO {left}")

print("\nSearch")
for q in ['"chisinau"*', '"spital"*', '"republicana"*', '"больница"*', '"botanica"*']:
    r = [x[0] for x in db.execute("select place_id from place_search where place_search match ?", (q,))]
    print(f"  {q:18} ->", r)
db.execute("update places set name='Spitalul Clinic Republican Chișinău' where id='p1'")
r = [x[0] for x in db.execute("select place_id from place_search where place_search match ?", ('"chisinau"*',))]
print("  after renaming p1 to include 'Chișinău', search 'chisinau' ->", r)

print(f"\n{ok_count} checks passed, {fail_count} problems")
sys.exit(1 if fail_count else 0)
