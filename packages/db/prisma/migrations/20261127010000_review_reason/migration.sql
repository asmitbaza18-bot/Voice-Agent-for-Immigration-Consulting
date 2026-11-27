-- Milestone 1: why a review item was queued (classifier reason, not_in_file, answer_blocked).
ALTER TABLE "ReviewItem" ADD COLUMN "reason" TEXT;
