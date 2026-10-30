CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `accounts_user_idx` ON `accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `answers` (
	`id` text PRIMARY KEY NOT NULL,
	`criterion_result_id` text NOT NULL,
	`question_id` text NOT NULL,
	`value` text NOT NULL,
	FOREIGN KEY (`criterion_result_id`) REFERENCES `criterion_results`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "answers_value_json_ck" CHECK(json_valid(value))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `answers_uq` ON `answers` (`criterion_result_id`,`question_id`);--> statement-breakpoint
CREATE TABLE `assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`place_id` text NOT NULL,
	`origin` text NOT NULL,
	`based_on_id` text,
	`overall_level` text,
	`is_current` integer DEFAULT false NOT NULL,
	`verified_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`based_on_id`) REFERENCES `assessments`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "assessments_origin_ck" CHECK("origin" IN ('motivatie_import', 'user_submission', 'admin_edit')),
	CONSTRAINT "assessments_level_ck" CHECK("overall_level" IS NULL OR "overall_level" IN ('accessible', 'partial', 'inaccessible')),
	CONSTRAINT "assessments_current_verified_ck" CHECK(is_current = 0 OR verified_at IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assessments_one_current_uq` ON `assessments` (`place_id`) WHERE is_current = 1;--> statement-breakpoint
CREATE INDEX `assessments_place_idx` ON `assessments` (`place_id`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`icon` text NOT NULL,
	`osm_tags` text NOT NULL,
	`display_order` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_code_unique` ON `categories` (`code`);--> statement-breakpoint
CREATE TABLE `change_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`table_name` text NOT NULL,
	`record_id` text NOT NULL,
	`action` text NOT NULL,
	`old_row` text,
	`new_row` text,
	`changed_by` text,
	`changed_at` integer NOT NULL,
	FOREIGN KEY (`changed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "change_log_action_ck" CHECK("action" IN ('insert', 'update', 'delete'))
);
--> statement-breakpoint
CREATE INDEX `change_log_record_idx` ON `change_log` (`table_name`,`record_id`);--> statement-breakpoint
CREATE TABLE `criteria` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`group` text NOT NULL,
	`is_mandatory` integer NOT NULL,
	`display_order` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "criteria_group_ck" CHECK("group" IN ('entry', 'inside', 'parking'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `criteria_code_unique` ON `criteria` (`code`);--> statement-breakpoint
CREATE TABLE `criterion_results` (
	`id` text PRIMARY KEY NOT NULL,
	`assessment_id` text NOT NULL,
	`criterion_id` text NOT NULL,
	`level` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`assessment_id`) REFERENCES `assessments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`criterion_id`) REFERENCES `criteria`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "criterion_results_level_ck" CHECK("level" IN ('accessible', 'partial', 'inaccessible', 'not_applicable'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `criterion_results_uq` ON `criterion_results` (`assessment_id`,`criterion_id`);--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`criterion_result_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`position` integer NOT NULL,
	`uploaded_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`criterion_result_id`) REFERENCES `criterion_results`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "photos_position_ck" CHECK(position BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `photos_position_uq` ON `photos` (`criterion_result_id`,`position`);--> statement-breakpoint
CREATE TABLE `places` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`osm_type` text,
	`osm_id` integer,
	`osm_tag` text,
	`osm_synced_at` integer,
	`name` text NOT NULL,
	`other_names` text,
	`category_id` text NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`address` text,
	`status` text DEFAULT 'active' NOT NULL,
	`published_level` text,
	`has_designated_parking` integer,
	`last_verified_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "places_source_ck" CHECK("source" IN ('osm', 'admin')),
	CONSTRAINT "places_osm_type_ck" CHECK("osm_type" IS NULL OR "osm_type" IN ('node', 'way', 'relation')),
	CONSTRAINT "places_status_ck" CHECK("status" IN ('active', 'hidden', 'gone_from_osm')),
	CONSTRAINT "places_level_ck" CHECK("published_level" IS NULL OR "published_level" IN ('accessible', 'partial', 'inaccessible')),
	CONSTRAINT "places_osm_fields_ck" CHECK((source = 'osm' AND osm_type IS NOT NULL AND osm_id IS NOT NULL)
       OR (source = 'admin' AND osm_type IS NULL AND osm_id IS NULL)),
	CONSTRAINT "places_lat_ck" CHECK(lat BETWEEN -90 AND 90),
	CONSTRAINT "places_lng_ck" CHECK(lng BETWEEN -180 AND 180)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `places_osm_uq` ON `places` (`osm_type`,`osm_id`);--> statement-breakpoint
CREATE INDEX `places_lat_lng_idx` ON `places` (`lat`,`lng`);--> statement-breakpoint
CREATE INDEX `places_category_idx` ON `places` (`category_id`);--> statement-breakpoint
CREATE INDEX `places_published_idx` ON `places` (`published_level`);--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`criterion_id` text NOT NULL,
	`code` text NOT NULL,
	`prompt` text NOT NULL,
	`type` text NOT NULL,
	`options` text,
	`is_main` integer DEFAULT false NOT NULL,
	`is_required` integer NOT NULL,
	`display_order` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`criterion_id`) REFERENCES `criteria`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "questions_type_ck" CHECK("type" IN ('choice', 'checkboxes', 'text')),
	CONSTRAINT "questions_options_ck" CHECK((type = 'text' AND options IS NULL) OR (type <> 'text' AND options IS NOT NULL)),
	CONSTRAINT "questions_main_is_choice_ck" CHECK(is_main = 0 OR type = 'choice')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `questions_criterion_code_uq` ON `questions` (`criterion_id`,`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `questions_one_main_uq` ON `questions` (`criterion_id`) WHERE is_main = 1;--> statement-breakpoint
CREATE TABLE `score_suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`strategy` text NOT NULL,
	`model_version` text,
	`level` text NOT NULL,
	`explanation` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "score_suggestions_strategy_ck" CHECK("strategy" IN ('rules', 'ml')),
	CONSTRAINT "score_suggestions_level_ck" CHECK("level" IN ('accessible', 'partial', 'inaccessible'))
);
--> statement-breakpoint
CREATE INDEX `score_suggestions_submission_idx` ON `score_suggestions` (`submission_id`);--> statement-breakpoint
CREATE TABLE `search_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`query` text NOT NULL,
	`result_count` integer NOT NULL,
	`opened_place_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`opened_place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`assessment_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`submitted_by` text NOT NULL,
	`submitted_at` integer NOT NULL,
	`reviewing_by` text,
	`reviewing_since` integer,
	`reviewed_by` text,
	`reviewed_at` integer,
	`rejection_reason` text,
	`edited_by_reviewer` integer DEFAULT false NOT NULL,
	`photos_deleted_at` integer,
	FOREIGN KEY (`assessment_id`) REFERENCES `assessments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`submitted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewing_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "submissions_kind_ck" CHECK("kind" IN ('first_assessment', 'update')),
	CONSTRAINT "submissions_status_ck" CHECK("status" IN ('pending', 'approved', 'rejected')),
	CONSTRAINT "submissions_decided_ck" CHECK(status = 'pending' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
	CONSTRAINT "submissions_reason_ck" CHECK(status <> 'rejected' OR rejection_reason IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submissions_assessment_id_unique` ON `submissions` (`assessment_id`);--> statement-breakpoint
CREATE INDEX `submissions_queue_idx` ON `submissions` (`status`,`submitted_at`);--> statement-breakpoint
CREATE INDEX `submissions_user_idx` ON `submissions` (`submitted_by`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text DEFAULT 'user' NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "users_role_ck" CHECK("role" IN ('user', 'reviewer', 'admin'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
