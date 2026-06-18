-- Add sync_mode column to provider_calendars
-- Values: "none" | "display" | "availability" (default)
-- Backfills existing rows: selected=true -> "availability", selected=false -> "none"

ALTER TABLE "provider_calendars"
  ADD COLUMN "sync_mode" TEXT NOT NULL DEFAULT 'availability';

-- Backfill: calendars already marked unselected get sync_mode="none"
UPDATE "provider_calendars"
  SET "sync_mode" = 'none'
  WHERE "selected" = false;
