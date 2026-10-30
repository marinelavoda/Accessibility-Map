-- Full-text search over place names (hand-written: Drizzle can't express FTS5).
-- "remove_diacritics 2" makes "Chisinau" match "Chișinău".
-- Triggers keep the index in sync with the places table automatically.
CREATE VIRTUAL TABLE `place_search` USING fts5(
  place_id UNINDEXED,
  name,
  other_names,
  tokenize = "unicode61 remove_diacritics 2",
  prefix = '2 3'
);
--> statement-breakpoint
CREATE TRIGGER `places_search_ai` AFTER INSERT ON `places` BEGIN
  INSERT INTO place_search (place_id, name, other_names)
  VALUES (new.id, new.name,
          (SELECT group_concat(value, ' ') FROM json_each(coalesce(new.other_names, '[]'))));
END;
--> statement-breakpoint
CREATE TRIGGER `places_search_au` AFTER UPDATE OF name, other_names ON `places` BEGIN
  DELETE FROM place_search WHERE place_id = old.id;
  INSERT INTO place_search (place_id, name, other_names)
  VALUES (new.id, new.name,
          (SELECT group_concat(value, ' ') FROM json_each(coalesce(new.other_names, '[]'))));
END;
--> statement-breakpoint
CREATE TRIGGER `places_search_ad` AFTER DELETE ON `places` BEGIN
  DELETE FROM place_search WHERE place_id = old.id;
END;
