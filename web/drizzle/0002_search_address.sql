-- Adds the address to the search index, so staff can find a place by its street
-- (hand-written: Drizzle can't express FTS5). An FTS5 table can't gain a column,
-- so the index and its triggers are rebuilt with the same settings plus `address`,
-- then filled again from the places table.
-- The mobile app can still search names only with a column filter: {name other_names} : ...
DROP TRIGGER IF EXISTS `places_search_ai`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `places_search_au`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `places_search_ad`;
--> statement-breakpoint
DROP TABLE IF EXISTS `place_search`;
--> statement-breakpoint
CREATE VIRTUAL TABLE `place_search` USING fts5(
  place_id UNINDEXED,
  name,
  other_names,
  address,
  tokenize = "unicode61 remove_diacritics 2",
  prefix = '2 3'
);
--> statement-breakpoint
INSERT INTO place_search (place_id, name, other_names, address)
SELECT id, name,
       (SELECT group_concat(value, ' ') FROM json_each(coalesce(other_names, '[]'))),
       address
FROM places;
--> statement-breakpoint
CREATE TRIGGER `places_search_ai` AFTER INSERT ON `places` BEGIN
  INSERT INTO place_search (place_id, name, other_names, address)
  VALUES (new.id, new.name,
          (SELECT group_concat(value, ' ') FROM json_each(coalesce(new.other_names, '[]'))),
          new.address);
END;
--> statement-breakpoint
CREATE TRIGGER `places_search_au` AFTER UPDATE OF name, other_names, address ON `places` BEGIN
  DELETE FROM place_search WHERE place_id = old.id;
  INSERT INTO place_search (place_id, name, other_names, address)
  VALUES (new.id, new.name,
          (SELECT group_concat(value, ' ') FROM json_each(coalesce(new.other_names, '[]'))),
          new.address);
END;
--> statement-breakpoint
CREATE TRIGGER `places_search_ad` AFTER DELETE ON `places` BEGIN
  DELETE FROM place_search WHERE place_id = old.id;
END;
