CREATE TABLE `form_webhooks` (
	`key` text PRIMARY KEY NOT NULL,
	`target_url` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `simulation_runs` (
	`simulation_id` text PRIMARY KEY NOT NULL,
	`pid` integer,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`error` text,
	`delivered` integer DEFAULT 0 NOT NULL,
	`skipped` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_simulation_runs_status` ON `simulation_runs` (`status`);--> statement-breakpoint
CREATE TABLE `simulations` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`status` text NOT NULL,
	`parameters` text NOT NULL,
	`generated_at` text,
	`started_at` text,
	`stopped_at` text,
	`completed_at` text,
	`stats` text
);
--> statement-breakpoint
CREATE INDEX `idx_simulations_status` ON `simulations` (`status`);