-- Add typed FK columns to calendar_sync_states (one per possible sourceKind)
-- This replaces the polymorphic string sourceId with proper FK-backed columns
-- that Postgres can enforce with ON DELETE CASCADE.

ALTER TABLE "calendar_sync_states"
  ADD COLUMN "connection_id" TEXT,
  ADD COLUMN "availability_source_id" TEXT;

-- Backfill: copy sourceId into the appropriate FK column based on sourceKind
UPDATE "calendar_sync_states"
  SET "connection_id" = "source_id"
  WHERE "source_kind" = 'connection';

UPDATE "calendar_sync_states"
  SET "availability_source_id" = "source_id"
  WHERE "source_kind" = 'ics_subscription';

-- Unique constraints (at most one sync state per source)
CREATE UNIQUE INDEX "calendar_sync_states_connection_id_key"
  ON "calendar_sync_states"("connection_id")
  WHERE "connection_id" IS NOT NULL;

CREATE UNIQUE INDEX "calendar_sync_states_availability_source_id_key"
  ON "calendar_sync_states"("availability_source_id")
  WHERE "availability_source_id" IS NOT NULL;

-- FK constraints with CASCADE so sync state is removed when its parent is deleted
ALTER TABLE "calendar_sync_states"
  ADD CONSTRAINT "calendar_sync_states_connection_id_fkey"
    FOREIGN KEY ("connection_id")
    REFERENCES "calendar_connections"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "calendar_sync_states"
  ADD CONSTRAINT "calendar_sync_states_availability_source_id_fkey"
    FOREIGN KEY ("availability_source_id")
    REFERENCES "availability_sources"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Add typed FK columns to cached_calendar_events
ALTER TABLE "cached_calendar_events"
  ADD COLUMN "connection_id" TEXT,
  ADD COLUMN "availability_source_id" TEXT;

-- Backfill
UPDATE "cached_calendar_events"
  SET "connection_id" = "source_id"
  WHERE "source_kind" = 'connection';

UPDATE "cached_calendar_events"
  SET "availability_source_id" = "source_id"
  WHERE "source_kind" = 'ics_subscription';

-- FK constraints with CASCADE so cached events are purged when their source is deleted
ALTER TABLE "cached_calendar_events"
  ADD CONSTRAINT "cached_calendar_events_connection_id_fkey"
    FOREIGN KEY ("connection_id")
    REFERENCES "calendar_connections"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cached_calendar_events"
  ADD CONSTRAINT "cached_calendar_events_availability_source_id_fkey"
    FOREIGN KEY ("availability_source_id")
    REFERENCES "availability_sources"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
