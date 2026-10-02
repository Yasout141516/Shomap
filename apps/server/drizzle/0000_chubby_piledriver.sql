CREATE TABLE `abuse_flags` (
	`id` text PRIMARY KEY NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`incident_id` text NOT NULL,
	`flagged_by` text NOT NULL,
	`reason` text NOT NULL,
	`state` text DEFAULT 'open' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`flagged_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `abuse_flags_target_user` ON `abuse_flags` (`target_type`,`target_id`,`flagged_by`);--> statement-breakpoint
CREATE TABLE `app_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `areas` (
	`id` text PRIMARY KEY NOT NULL,
	`name_en` text NOT NULL,
	`name_bn` text NOT NULL,
	`city_corp` text NOT NULL,
	`centroid_lat` real NOT NULL,
	`centroid_lng` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `authorities` (
	`id` text PRIMARY KEY NOT NULL,
	`name_en` text NOT NULL,
	`name_bn` text NOT NULL,
	`type` text NOT NULL,
	`contact_phone` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`name_en` text NOT NULL,
	`name_bn` text NOT NULL,
	`kind` text NOT NULL,
	`icon` text NOT NULL,
	`default_urgency` text NOT NULL,
	`authority_type` text,
	`triggers_sos` integer DEFAULT false NOT NULL,
	`is_blocked` integer DEFAULT false NOT NULL,
	`redirect_hotline` text,
	`anonymous_default` integer DEFAULT false NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_key_unique` ON `categories` (`key`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`incident_id` text NOT NULL,
	`author_id` text NOT NULL,
	`parent_id` text,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`is_anonymous` integer DEFAULT false NOT NULL,
	`is_hidden` integer DEFAULT false NOT NULL,
	`lat` real,
	`lng` real,
	`created_at` text NOT NULL,
	FOREIGN KEY (`incident_id`) REFERENCES `incidents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `comments_incident_idx` ON `comments` (`incident_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `incident_media` (
	`id` text PRIMARY KEY NOT NULL,
	`incident_id` text NOT NULL,
	`url` text NOT NULL,
	`public_hidden` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`incident_id`) REFERENCES `incidents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter_id` text NOT NULL,
	`category_id` text NOT NULL,
	`area_id` text NOT NULL,
	`description` text NOT NULL,
	`urgency` text NOT NULL,
	`status` text NOT NULL,
	`verification` text NOT NULL,
	`is_anonymous` integer DEFAULT false NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`address_text` text,
	`confirm_count` integer DEFAULT 0 NOT NULL,
	`dispute_count` integer DEFAULT 0 NOT NULL,
	`still_count` integer DEFAULT 0 NOT NULL,
	`review_reason` text,
	`review_note` text,
	`idempotency_key` text,
	`occurred_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`resolved_at` text,
	FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `incidents_idempotency_key_unique` ON `incidents` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `incidents_created_idx` ON `incidents` (`created_at`);--> statement-breakpoint
CREATE INDEX `incidents_reporter_idx` ON `incidents` (`reporter_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `jurisdictions` (
	`authority_id` text NOT NULL,
	`area_id` text NOT NULL,
	PRIMARY KEY(`authority_id`, `area_id`),
	FOREIGN KEY (`authority_id`) REFERENCES `authorities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`incident_id` text,
	`sos_alert_id` text,
	`type` text NOT NULL,
	`title_key` text NOT NULL,
	`params` text DEFAULT '{}' NOT NULL,
	`read_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `referrals` (
	`id` text PRIMARY KEY NOT NULL,
	`incident_id` text NOT NULL,
	`authority_id` text NOT NULL,
	`source` text NOT NULL,
	`referred_at` text NOT NULL,
	`acknowledged_at` text,
	`resolved_at` text,
	`resolution_note` text,
	FOREIGN KEY (`incident_id`) REFERENCES `incidents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`authority_id`) REFERENCES `authorities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `referrals_incident_id_unique` ON `referrals` (`incident_id`);--> statement-breakpoint
CREATE TABLE `sos_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`incident_id` text NOT NULL,
	`center_lat` real NOT NULL,
	`center_lng` real NOT NULL,
	`radius_m` integer NOT NULL,
	`state` text NOT NULL,
	`child_name` text NOT NULL,
	`child_age` integer NOT NULL,
	`clothing` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`issued_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`closed_at` text,
	FOREIGN KEY (`incident_id`) REFERENCES `incidents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sos_alerts_incident_id_unique` ON `sos_alerts` (`incident_id`);--> statement-breakpoint
CREATE TABLE `status_events` (
	`id` text PRIMARY KEY NOT NULL,
	`incident_id` text NOT NULL,
	`actor_id` text,
	`actor_role` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`incident_id`) REFERENCES `incidents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `status_events_incident_idx` ON `status_events` (`incident_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `still_happening` (
	`incident_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`incident_id`, `user_id`),
	FOREIGN KEY (`incident_id`) REFERENCES `incidents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`phone` text NOT NULL,
	`role` text NOT NULL,
	`lang` text DEFAULT 'en' NOT NULL,
	`home_area_id` text,
	`authority_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`home_area_id`) REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`authority_id`) REFERENCES `authorities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_phone_unique` ON `users` (`phone`);--> statement-breakpoint
CREATE TABLE `verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`incident_id` text NOT NULL,
	`user_id` text NOT NULL,
	`vote` text NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`incident_id`) REFERENCES `incidents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `verifications_incident_user` ON `verifications` (`incident_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `watch_zones` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`center_lat` real NOT NULL,
	`center_lng` real NOT NULL,
	`radius_m` integer NOT NULL,
	`min_urgency` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
