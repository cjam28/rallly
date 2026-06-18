-- CreateEnum extension for CalDAV credentials
ALTER TYPE "CredentialType" ADD VALUE 'CALDAV';

-- CreateTable
CREATE TABLE "calendar_sync_states" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source_kind" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "sync_from" TIMESTAMP(3) NOT NULL,
    "last_sync_at" TIMESTAMP(3),
    "last_status" TEXT NOT NULL DEFAULT 'pending',
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_sync_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cached_calendar_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source_kind" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "external_uid" TEXT NOT NULL,
    "calendar_id" TEXT,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "summary" TEXT,
    "raw" JSONB,
    "synced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cached_calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "calendar_sync_states_source_id_key" ON "calendar_sync_states"("source_id");

-- CreateIndex
CREATE INDEX "calendar_sync_states_user_id_idx" ON "calendar_sync_states"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "cached_calendar_events_source_id_external_uid_key" ON "cached_calendar_events"("source_id", "external_uid");

-- CreateIndex
CREATE INDEX "cached_event_user_range_idx" ON "cached_calendar_events"("user_id", "start_time", "end_time");

-- AddForeignKey
ALTER TABLE "calendar_sync_states" ADD CONSTRAINT "calendar_sync_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cached_calendar_events" ADD CONSTRAINT "cached_calendar_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
