CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text,
	`action` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `backups` (
	`id` text PRIMARY KEY NOT NULL,
	`filename` text NOT NULL,
	`created_at` text NOT NULL,
	`size` integer NOT NULL,
	`label` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `control` (
	`id` integer PRIMARY KEY NOT NULL,
	`generation` text NOT NULL,
	`busy` text,
	`lease` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`generation` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `friendships` (
	`generation` text NOT NULL,
	`id` text NOT NULL,
	`requester` text NOT NULL,
	`recipient` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`generation`, `id`),
	CONSTRAINT "friend_status" CHECK("friendships"."requester"<>"friendships"."recipient" AND "friendships"."status" IN ('PENDING','ACCEPTED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `friend_pair` ON `friendships` (`generation`,min("requester","recipient"),max("requester","recipient"));--> statement-breakpoint
CREATE TABLE `grants` (
	`token` text PRIMARY KEY NOT NULL,
	`generation` text NOT NULL,
	`actor` text NOT NULL,
	`kind` text NOT NULL,
	`value` text,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `guard` (
	`ok` integer NOT NULL,
	CONSTRAINT "guard_ok" CHECK("guard"."ok"=1)
);
--> statement-breakpoint
CREATE TABLE `limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `matches` (
	`generation` text NOT NULL,
	`id` text NOT NULL,
	`player1` text NOT NULL,
	`player2` text,
	`ranked` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'WAITING' NOT NULL,
	`state` text NOT NULL,
	`winner` text,
	`loser` text,
	`result_applied` integer DEFAULT 0 NOT NULL,
	`reason` text,
	`created_at` text NOT NULL,
	`finished_at` text,
	`version` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`generation`, `id`),
	CONSTRAINT "match_status" CHECK("matches"."status" IN ('WAITING','ACTIVE','COMPLETED','ABANDONED'))
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`generation` text NOT NULL,
	`id` text NOT NULL,
	`sender` text NOT NULL,
	`recipient` text NOT NULL,
	`body` text NOT NULL,
	`client_nonce` text NOT NULL,
	`created_at` text NOT NULL,
	`read_at` text,
	PRIMARY KEY(`generation`, `id`),
	CONSTRAINT "message_body" CHECK(length("messages"."body") BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `message_nonce` ON `messages` (`generation`,`sender`,`client_nonce`);--> statement-breakpoint
CREATE TABLE `presence` (
	`generation` text NOT NULL,
	`user_id` text NOT NULL,
	`seen` integer NOT NULL,
	PRIMARY KEY(`generation`, `user_id`)
);
--> statement-breakpoint
CREATE TABLE `previews` (
	`generation` text NOT NULL,
	`match_id` text NOT NULL,
	`actor` text NOT NULL,
	`payload` text NOT NULL,
	`updated` integer NOT NULL,
	PRIMARY KEY(`generation`, `match_id`)
);
--> statement-breakpoint
CREATE TABLE `seats` (
	`generation` text NOT NULL,
	`user_id` text NOT NULL,
	`match_id` text NOT NULL,
	PRIMARY KEY(`generation`, `user_id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`generation` text NOT NULL,
	`user_id` text NOT NULL,
	`csrf` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_settings` (
	`generation` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`generation`, `key`)
);
--> statement-breakpoint
CREATE TABLE `match_shots` (
	`generation` text NOT NULL,
	`match_id` text NOT NULL,
	`nonce` text NOT NULL,
	`actor` text NOT NULL,
	`parameters` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`generation`, `match_id`, `nonce`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`generation` text NOT NULL,
	`id` text NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'PLAYER' NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`avatar` text,
	`disabled` integer DEFAULT 0 NOT NULL,
	`must_change_password` integer DEFAULT 0 NOT NULL,
	`rp` integer DEFAULT 1000 NOT NULL,
	`wins` integer DEFAULT 0 NOT NULL,
	`losses` integer DEFAULT 0 NOT NULL,
	`settings` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`generation`, `id`),
	CONSTRAINT "user_role" CHECK("users"."role" IN ('ADMIN','PLAYER')),
	CONSTRAINT "nonnegative_stats" CHECK("users"."rp">=0 AND "users"."wins">=0 AND "users"."losses">=0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `username_unique` ON `users` (`generation`,lower("username"));
