-- CreateTable
CREATE TABLE "availability_sources" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "availability_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_snapshots" (
    "id" TEXT NOT NULL,
    "poll_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" JSONB NOT NULL,
    "suggested_slots" JSONB NOT NULL,
    "busy_breakdown" JSONB NOT NULL,
    "participant_ids" TEXT[],

    CONSTRAINT "availability_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "availability_sources_user_id_idx" ON "availability_sources"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "availability_snapshots_poll_id_key" ON "availability_snapshots"("poll_id");

-- CreateIndex
CREATE UNIQUE INDEX "availability_snapshots_token_key" ON "availability_snapshots"("token");

-- AddForeignKey
ALTER TABLE "availability_sources" ADD CONSTRAINT "availability_sources_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
