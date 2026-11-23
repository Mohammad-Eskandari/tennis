PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_events` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`generation` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`generation`,`user_id`) REFERENCES `users`(`generation`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_events`("seq", "generation", "user_id", "name", "payload", "created_at") SELECT "seq", "generation", "user_id", "name", "payload", "created_at" FROM `events`;--> statement-breakpoint
DROP TABLE `events`;--> statement-breakpoint
ALTER TABLE `__new_events` RENAME TO `events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `events_recipient_seq` ON `events` (`generation`,`user_id`,`seq`);--> statement-breakpoint
CREATE TABLE `__new_friendships` (
	`generation` text NOT NULL,
	`id` text NOT NULL,
	`requester` text NOT NULL,
	`recipient` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`generation`, `id`),
	FOREIGN KEY (`generation`,`requester`) REFERENCES `users`(`generation`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generation`,`recipient`) REFERENCES `users`(`generation`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "friend_status" CHECK("__new_friendships"."requester"<>"__new_friendships"."recipient" AND "__new_friendships"."status" IN ('PENDING','ACCEPTED'))
);
--> statement-breakpoint
INSERT INTO `__new_friendships`("generation", "id", "requester", "recipient", "status", "created_at") SELECT "generation", "id", "requester", "recipient", "status", "created_at" FROM `friendships`;--> statement-breakpoint
DROP TABLE `friendships`;--> statement-breakpoint
ALTER TABLE `__new_friendships` RENAME TO `friendships`;--> statement-breakpoint
CREATE UNIQUE INDEX `friend_pair` ON `friendships` (`generation`,min("requester","recipient"),max("requester","recipient"));--> statement-breakpoint
CREATE TABLE `__new_matches` (
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
	FOREIGN KEY (`generation`,`player1`) REFERENCES `users`(`generation`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generation`,`player2`) REFERENCES `users`(`generation`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generation`,`winner`) REFERENCES `users`(`generation`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generation`,`loser`) REFERENCES `users`(`generation`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "match_status" CHECK("__new_matches"."status" IN ('WAITING','ACTIVE','COMPLETED','ABANDONED'))
);
--> statement-breakpoint
INSERT INTO `__new_matches`("generation", "id", "player1", "player2", "ranked", "status", "state", "winner", "loser", "result_applied", "reason", "created_at", "finished_at", "version") SELECT "generation", "id", "player1", "player2", "ranked", "status", "state", "winner", "loser", "result_applied", "reason", "created_at", "finished_at", "version" FROM `matches`;--> statement-breakpoint
DROP TABLE `matches`;--> statement-breakpoint
ALTER TABLE `__new_matches` RENAME TO `matches`;--> statement-breakpoint
CREATE TABLE `__new_messages` (
	`generation` text NOT NULL,
	`id` text NOT NULL,
	`sender` text NOT NULL,
	`recipient` text NOT NULL,
	`body` text NOT NULL,
	`client_nonce` text NOT NULL,
	`created_at` text NOT NULL,
	`read_at` text,
	PRIMARY KEY(`generation`, `id`),
	FOREIGN KEY (`generation`,`sender`) REFERENCES `users`(`generation`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generation`,`recipient`) REFERENCES `users`(`generation`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "message_body" CHECK(length("__new_messages"."body") BETWEEN 1 AND 2000)
);
--> statement-breakpoint
INSERT INTO `__new_messages`("generation", "id", "sender", "recipient", "body", "client_nonce", "created_at", "read_at") SELECT "generation", "id", "sender", "recipient", "body", "client_nonce", "created_at", "read_at" FROM `messages`;--> statement-breakpoint
DROP TABLE `messages`;--> statement-breakpoint
ALTER TABLE `__new_messages` RENAME TO `messages`;--> statement-breakpoint
CREATE UNIQUE INDEX `message_nonce` ON `messages` (`generation`,`sender`,`client_nonce`);--> statement-breakpoint
CREATE TABLE `__new_presence` (
	`generation` text NOT NULL,
	`user_id` text NOT NULL,
	`seen` integer NOT NULL,
	PRIMARY KEY(`generation`, `user_id`),
	FOREIGN KEY (`generation`,`user_id`) REFERENCES `users`(`generation`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_presence`("generation", "user_id", "seen") SELECT "generation", "user_id", "seen" FROM `presence`;--> statement-breakpoint
DROP TABLE `presence`;--> statement-breakpoint
ALTER TABLE `__new_presence` RENAME TO `presence`;--> statement-breakpoint
CREATE TABLE `__new_previews` (
	`generation` text NOT NULL,
	`match_id` text NOT NULL,
	`actor` text NOT NULL,
	`payload` text NOT NULL,
	`updated` integer NOT NULL,
	PRIMARY KEY(`generation`, `match_id`),
	FOREIGN KEY (`generation`,`actor`) REFERENCES `users`(`generation`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generation`,`match_id`) REFERENCES `matches`(`generation`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_previews`("generation", "match_id", "actor", "payload", "updated") SELECT "generation", "match_id", "actor", "payload", "updated" FROM `previews`;--> statement-breakpoint
DROP TABLE `previews`;--> statement-breakpoint
ALTER TABLE `__new_previews` RENAME TO `previews`;--> statement-breakpoint
CREATE TABLE `__new_seats` (
	`generation` text NOT NULL,
	`user_id` text NOT NULL,
	`match_id` text NOT NULL,
	PRIMARY KEY(`generation`, `user_id`),
	FOREIGN KEY (`generation`,`user_id`) REFERENCES `users`(`generation`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generation`,`match_id`) REFERENCES `matches`(`generation`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_seats`("generation", "user_id", "match_id") SELECT "generation", "user_id", "match_id" FROM `seats`;--> statement-breakpoint
DROP TABLE `seats`;--> statement-breakpoint
ALTER TABLE `__new_seats` RENAME TO `seats`;--> statement-breakpoint
CREATE TABLE `__new_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`generation` text NOT NULL,
	`user_id` text NOT NULL,
	`csrf` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`generation`,`user_id`) REFERENCES `users`(`generation`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_sessions`("token_hash", "generation", "user_id", "csrf", "expires_at") SELECT "token_hash", "generation", "user_id", "csrf", "expires_at" FROM `sessions`;--> statement-breakpoint
DROP TABLE `sessions`;--> statement-breakpoint
ALTER TABLE `__new_sessions` RENAME TO `sessions`;--> statement-breakpoint
CREATE TABLE `__new_match_shots` (
	`generation` text NOT NULL,
	`match_id` text NOT NULL,
	`nonce` text NOT NULL,
	`actor` text NOT NULL,
	`parameters` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`generation`, `match_id`, `nonce`),
	FOREIGN KEY (`generation`,`actor`) REFERENCES `users`(`generation`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generation`,`match_id`) REFERENCES `matches`(`generation`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_match_shots`("generation", "match_id", "nonce", "actor", "parameters", "created_at") SELECT "generation", "match_id", "nonce", "actor", "parameters", "created_at" FROM `match_shots`;--> statement-breakpoint
DROP TABLE `match_shots`;--> statement-breakpoint
ALTER TABLE `__new_match_shots` RENAME TO `match_shots`;