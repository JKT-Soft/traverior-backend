-- Planning chat transcript and the live skeleton draft.
-- planning_messages.payload holds a skeleton card or a clarification.
-- draft_stop_id / selected_stop_id are keys inside the draft JSON, not stops.id.
-- The payload CHECK is intentional and is not represented in schema.prisma.

-- CreateEnum
CREATE TYPE "planning_phase" AS ENUM ('collecting', 'draft', 'searching', 'ready');
CREATE TYPE "planning_concept" AS ENUM ('culture', 'entertainment', 'business', 'food', 'family');
CREATE TYPE "planning_message_role" AS ENUM ('user', 'assistant');
CREATE TYPE "planning_message_kind" AS ENUM ('text', 'skeleton', 'clarification');

-- CreateTable
CREATE TABLE "planning_drafts" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "phase" "planning_phase" NOT NULL DEFAULT 'collecting',
    "title" TEXT,
    "concept" "planning_concept",
    "tone" TEXT,
    "origin_city" TEXT,
    "start_date" DATE,
    "end_date" DATE,
    "party_size" INTEGER,
    "selected_stop_id" TEXT,
    "stops" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "planning_drafts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "planning_messages" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "role" "planning_message_role" NOT NULL,
    "kind" "planning_message_kind" NOT NULL,
    "body" TEXT,
    "draft_stop_id" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planning_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "planning_drafts_trip_id_key" ON "planning_drafts"("trip_id");
CREATE UNIQUE INDEX "planning_messages_trip_id_position_key" ON "planning_messages"("trip_id", "position");
CREATE INDEX "planning_messages_trip_id_created_at_idx" ON "planning_messages"("trip_id", "created_at");

-- AddForeignKey
ALTER TABLE "planning_drafts" ADD CONSTRAINT "planning_drafts_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "planning_messages" ADD CONSTRAINT "planning_messages_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A text turn needs a body. A skeleton or clarification turn needs a payload snapshot.
ALTER TABLE "planning_messages" ADD CONSTRAINT "planning_messages_payload_check" CHECK (
    (kind = 'text' AND body IS NOT NULL)
    OR (kind IN ('skeleton', 'clarification') AND payload IS NOT NULL)
);
