DROP INDEX "custom_questions_type_position_idx";--> statement-breakpoint
CREATE INDEX "custom_questions_type_position_idx" ON "custom_questions" USING btree ("meeting_type_id","position");