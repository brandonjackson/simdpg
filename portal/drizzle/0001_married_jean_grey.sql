CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`is_default` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO `projects` ("id", "name", "description", "is_default", "created_at", "updated_at") VALUES ('default', 'Default project', 'The OpenFn project live portal form submissions are sent to.', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_form_webhooks` (
	`project_id` text NOT NULL,
	`key` text NOT NULL,
	`target_url` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`project_id`, `key`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_form_webhooks`("project_id", "key", "target_url", "updated_at") SELECT 'default', "key", "target_url", "updated_at" FROM `form_webhooks`;--> statement-breakpoint
DROP TABLE `form_webhooks`;--> statement-breakpoint
ALTER TABLE `__new_form_webhooks` RENAME TO `form_webhooks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_form_webhooks_project` ON `form_webhooks` (`project_id`);