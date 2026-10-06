-- Nested stops + typed catalog (docs/new_db_design_note.md).
-- Preserves users, preferences, trips, alerts, logs, saved places, cache, and rates.
-- PipelineNode rows are not rewritten into stops: each existing trip gets an empty journey.
-- Partial unique indexes below are intentional and are not represented in schema.prisma.

-- CreateEnum
CREATE TYPE "trip_status" AS ENUM ('draft', 'planning', 'ready', 'active', 'completed', 'archived');
CREATE TYPE "stop_kind" AS ENUM ('hub', 'travel', 'stay', 'day', 'activity', 'transit');
CREATE TYPE "hub_role" AS ENUM ('origin', 'return');
CREATE TYPE "stop_status" AS ENUM ('planned', 'active', 'completed', 'disrupted', 'skipped');
CREATE TYPE "content_origin" AS ENUM ('ai', 'user', 'api');
CREATE TYPE "booking_kind" AS ENUM ('flight', 'hotel', 'event', 'place', 'route', 'weather', 'visa', 'checklist');
CREATE TYPE "booking_role" AS ENUM ('recommended', 'alternative', 'selected', 'confirmed');
CREATE TYPE "budget_scope" AS ENUM ('trip', 'journey', 'stop');
CREATE TYPE "budget_category" AS ENUM ('transport', 'accommodation', 'activities', 'food', 'other', 'total');
CREATE TYPE "media_role" AS ENUM ('cover', 'thumbnail', 'gallery');
CREATE TYPE "note_kind" AS ENUM ('about', 'user', 'system', 'checklist');
CREATE TYPE "budget_style" AS ENUM ('budget', 'balanced', 'luxury');
CREATE TYPE "pace" AS ENUM ('relaxed', 'moderate', 'packed');
CREATE TYPE "travel_with" AS ENUM ('solo', 'couple', 'family', 'friends');
CREATE TYPE "alert_severity" AS ENUM ('info', 'warning', 'critical');
CREATE TYPE "edit_action" AS ENUM ('add', 'edit', 'delete', 'lock', 'unlock', 'reorder', 'replace', 'replan');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "firebase_uid" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT,
    "photo_url" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'id',
    "home_currency" CHAR(3) NOT NULL DEFAULT 'IDR',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "budget_max" DECIMAL(14,2),
    "budget_style" "budget_style" NOT NULL DEFAULT 'balanced',
    "pace" "pace" NOT NULL DEFAULT 'moderate',
    "dietary" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "travel_with" "travel_with",
    "avoid" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "home_city" TEXT,
    "passport_country" CHAR(2),
    "extra" JSONB,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "trips" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "status" "trip_status" NOT NULL DEFAULT 'draft',
    "origin_city" TEXT,
    "destination_summary" TEXT,
    "start_date" DATE,
    "end_date" DATE,
    "party_size" INTEGER NOT NULL DEFAULT 1,
    "base_currency" CHAR(3) NOT NULL DEFAULT 'IDR',
    "total_cost_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_cost_is_estimate" BOOLEAN NOT NULL DEFAULT true,
    "total_duration_minutes" INTEGER NOT NULL DEFAULT 0,
    "cover_media_id" UUID,
    "planning_version" INTEGER NOT NULL DEFAULT 0,
    "last_planned_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "journeys" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "journeys_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stops" (
    "id" UUID NOT NULL,
    "journey_id" UUID NOT NULL,
    "parent_stop_id" UUID,
    "kind" "stop_kind" NOT NULL,
    "hub_role" "hub_role",
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subtitle" TEXT,
    "status" "stop_status" NOT NULL DEFAULT 'planned',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "path" TEXT NOT NULL,
    "days" INTEGER,
    "country_code" CHAR(2),
    "city" TEXT,
    "airport_iata" CHAR(3),
    "schedule_start" TIMESTAMPTZ(3),
    "schedule_end" TIMESTAMPTZ(3),
    "date_start" DATE,
    "date_end" DATE,
    "location_lat" DOUBLE PRECISION,
    "location_lng" DOUBLE PRECISION,
    "location_label" TEXT,
    "origin" "content_origin" NOT NULL DEFAULT 'ai',
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "is_custom" BOOLEAN NOT NULL DEFAULT false,
    "suppress_ai_restore" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(3),
    "last_refreshed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "stops_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "medias" (
    "id" UUID NOT NULL,
    "trip_id" UUID,
    "stop_id" UUID,
    "role" "media_role" NOT NULL DEFAULT 'gallery',
    "image_url" TEXT NOT NULL,
    "thumbnail_url" TEXT,
    "provider" TEXT,
    "provider_ref" TEXT,
    "attribution" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "medias_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "budgets" (
    "id" UUID NOT NULL,
    "trip_id" UUID,
    "journey_id" UUID,
    "stop_id" UUID,
    "scope" "budget_scope" NOT NULL,
    "category" "budget_category" NOT NULL DEFAULT 'total',
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "is_estimate" BOOLEAN NOT NULL DEFAULT true,
    "spent_amount" DECIMAL(14,2),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notes" (
    "id" UUID NOT NULL,
    "trip_id" UUID,
    "stop_id" UUID,
    "kind" "note_kind" NOT NULL DEFAULT 'about',
    "title" TEXT,
    "body" TEXT NOT NULL,
    "origin" "content_origin" NOT NULL DEFAULT 'ai',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "catalog_flights" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_ref" TEXT,
    "airline_name" TEXT,
    "airline_iata" CHAR(2),
    "carrier" TEXT,
    "flight_number" TEXT,
    "origin_iata" CHAR(3) NOT NULL,
    "destination_iata" CHAR(3) NOT NULL,
    "origin_airport" JSONB,
    "destination_airport" JSONB,
    "departure_at" TIMESTAMPTZ(3),
    "arrival_at" TIMESTAMPTZ(3),
    "cabin" TEXT,
    "cabin_label" TEXT,
    "stops" INTEGER,
    "transit" TEXT,
    "duration_minutes" INTEGER,
    "baggage" JSONB,
    "slices" JSONB,
    "price_amount" DECIMAL(14,2),
    "price_currency" CHAR(3),
    "price_is_estimate" BOOLEAN NOT NULL DEFAULT false,
    "deep_link_url" TEXT,
    "raw" JSONB,
    "fetched_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "catalog_flights_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "catalog_hotels" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_ref" TEXT,
    "hotel_id" TEXT,
    "name" TEXT NOT NULL,
    "stars" INTEGER,
    "rating" DECIMAL(3,1),
    "review_count" INTEGER,
    "board_type" TEXT,
    "board_name" TEXT,
    "nights" INTEGER,
    "address" TEXT,
    "city" TEXT,
    "country_code" CHAR(2),
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "check_in" DATE,
    "check_out" DATE,
    "check_in_time" TEXT,
    "check_out_time" TEXT,
    "refundable" BOOLEAN,
    "price_amount" DECIMAL(14,2),
    "price_currency" CHAR(3),
    "price_is_estimate" BOOLEAN NOT NULL DEFAULT true,
    "deep_link_url" TEXT,
    "raw" JSONB,
    "fetched_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "catalog_hotels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "catalog_events" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_ref" TEXT,
    "external_id" TEXT,
    "name" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(3),
    "ends_at" TIMESTAMPTZ(3),
    "is_free" BOOLEAN,
    "venue_name" TEXT,
    "address" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "price_amount" DECIMAL(14,2),
    "price_currency" CHAR(3),
    "price_is_estimate" BOOLEAN NOT NULL DEFAULT true,
    "deep_link_url" TEXT,
    "raw" JSONB,
    "fetched_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "catalog_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "catalog_visas" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'static',
    "passport_country" CHAR(2) NOT NULL,
    "destination_country" CHAR(2) NOT NULL,
    "summary" TEXT,
    "documents" JSONB,
    "requirements" JSONB,
    "raw" JSONB,
    "fetched_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "catalog_visas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "catalog_weathers" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "timezone" TEXT,
    "current_temp_c" DECIMAL(5,2),
    "alerts" JSONB,
    "daily" JSONB,
    "raw" JSONB,
    "fetched_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "catalog_weathers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "catalog_places" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "places" JSONB NOT NULL,
    "raw" JSONB,
    "fetched_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "catalog_places_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "catalog_routes" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "mode" TEXT,
    "distance_meters" INTEGER,
    "duration_minutes" INTEGER,
    "steps_summary" JSONB,
    "polyline" TEXT,
    "raw" JSONB,
    "fetched_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "catalog_routes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "catalog_checklists" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'internal',
    "title" TEXT NOT NULL DEFAULT 'Travel checklist',
    "items" JSONB NOT NULL,
    "raw" JSONB,
    "fetched_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "catalog_checklists_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "stop_id" UUID NOT NULL,
    "kind" "booking_kind" NOT NULL,
    "role" "booking_role" NOT NULL DEFAULT 'recommended',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "catalog_flight_id" UUID,
    "catalog_hotel_id" UUID,
    "catalog_event_id" UUID,
    "catalog_place_id" UUID,
    "catalog_route_id" UUID,
    "catalog_weather_id" UUID,
    "catalog_visa_id" UUID,
    "catalog_checklist_id" UUID,
    "deep_link_url" TEXT,
    "cost_amount" DECIMAL(14,2),
    "cost_currency" CHAR(3),
    "cost_is_estimate" BOOLEAN NOT NULL DEFAULT true,
    "origin" "content_origin" NOT NULL DEFAULT 'ai',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "trip_alerts" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "stop_id" UUID,
    "kind" TEXT NOT NULL,
    "severity" "alert_severity" NOT NULL DEFAULT 'info',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trip_alerts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "application_logs" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "source" TEXT,
    "status" TEXT,
    "message" TEXT,
    "user_id" UUID,
    "trip_id" UUID,
    "payload" JSONB,
    "result" JSONB,
    "error" JSONB,
    "duration_ms" INTEGER,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    CONSTRAINT "application_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "saved_places" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'user',
    "provider" TEXT,
    "provider_ref" TEXT,
    "trip_id" UUID,
    "stop_id" UUID,
    "notes" TEXT,
    "extra" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "saved_places_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stop_edit_logs" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "stop_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "action" "edit_action" NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stop_edit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "provider_cache" (
    "id" UUID NOT NULL,
    "cache_key" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "tool_name" TEXT NOT NULL,
    "request" JSONB NOT NULL,
    "response" JSONB NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "provider_cache_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "exchange_rates" (
    "base" CHAR(3) NOT NULL,
    "quote" CHAR(3) NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "fetched_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("base","quote")
);

-- Indexes
CREATE UNIQUE INDEX "users_firebase_uid_key" ON "users"("firebase_uid");
CREATE UNIQUE INDEX "user_preferences_user_id_key" ON "user_preferences"("user_id");
CREATE INDEX "trips_user_id_status_idx" ON "trips"("user_id", "status");
CREATE INDEX "trips_user_id_updated_at_idx" ON "trips"("user_id", "updated_at");
CREATE UNIQUE INDEX "journeys_trip_id_key" ON "journeys"("trip_id");
CREATE INDEX "stops_journey_id_parent_stop_id_sort_order_idx" ON "stops"("journey_id", "parent_stop_id", "sort_order");
CREATE INDEX "stops_journey_id_path_idx" ON "stops"("journey_id", "path");
CREATE INDEX "stops_journey_id_kind_idx" ON "stops"("journey_id", "kind");
CREATE INDEX "stops_journey_id_deleted_at_idx" ON "stops"("journey_id", "deleted_at");
CREATE INDEX "stops_journey_id_slug_idx" ON "stops"("journey_id", "slug");
CREATE UNIQUE INDEX "stops_journey_slug_active" ON "stops"("journey_id", "slug") WHERE "deleted_at" IS NULL;
CREATE INDEX "bookings_stop_id_kind_sort_order_idx" ON "bookings"("stop_id", "kind", "sort_order");
CREATE UNIQUE INDEX "bookings_one_selected_per_stop_kind" ON "bookings"("stop_id", "kind") WHERE "role" IN ('selected', 'confirmed');
CREATE INDEX "medias_trip_id_idx" ON "medias"("trip_id");
CREATE INDEX "medias_stop_id_idx" ON "medias"("stop_id");
CREATE INDEX "budgets_trip_id_scope_idx" ON "budgets"("trip_id", "scope");
CREATE INDEX "budgets_stop_id_category_idx" ON "budgets"("stop_id", "category");
CREATE INDEX "notes_trip_id_idx" ON "notes"("trip_id");
CREATE INDEX "notes_stop_id_idx" ON "notes"("stop_id");
CREATE INDEX "catalog_flights_trip_id_idx" ON "catalog_flights"("trip_id");
CREATE INDEX "catalog_flights_provider_provider_ref_idx" ON "catalog_flights"("provider", "provider_ref");
CREATE INDEX "catalog_hotels_trip_id_idx" ON "catalog_hotels"("trip_id");
CREATE INDEX "catalog_hotels_provider_provider_ref_idx" ON "catalog_hotels"("provider", "provider_ref");
CREATE INDEX "catalog_events_trip_id_idx" ON "catalog_events"("trip_id");
CREATE INDEX "catalog_events_provider_provider_ref_idx" ON "catalog_events"("provider", "provider_ref");
CREATE INDEX "catalog_visas_trip_id_idx" ON "catalog_visas"("trip_id");
CREATE INDEX "catalog_weathers_trip_id_idx" ON "catalog_weathers"("trip_id");
CREATE INDEX "catalog_places_trip_id_idx" ON "catalog_places"("trip_id");
CREATE INDEX "catalog_routes_trip_id_idx" ON "catalog_routes"("trip_id");
CREATE INDEX "catalog_checklists_trip_id_idx" ON "catalog_checklists"("trip_id");
CREATE INDEX "trip_alerts_trip_id_is_read_created_at_idx" ON "trip_alerts"("trip_id", "is_read", "created_at");
CREATE INDEX "application_logs_type_started_at_idx" ON "application_logs"("type", "started_at");
CREATE INDEX "application_logs_level_started_at_idx" ON "application_logs"("level", "started_at");
CREATE INDEX "application_logs_status_started_at_idx" ON "application_logs"("status", "started_at");
CREATE INDEX "application_logs_trip_id_started_at_idx" ON "application_logs"("trip_id", "started_at");
CREATE INDEX "application_logs_user_id_started_at_idx" ON "application_logs"("user_id", "started_at");
CREATE UNIQUE INDEX "saved_places_user_id_provider_provider_ref_key" ON "saved_places"("user_id", "provider", "provider_ref");
CREATE INDEX "saved_places_user_id_created_at_idx" ON "saved_places"("user_id", "created_at");
CREATE INDEX "saved_places_user_id_stop_id_idx" ON "saved_places"("user_id", "stop_id");
CREATE INDEX "stop_edit_logs_trip_id_created_at_idx" ON "stop_edit_logs"("trip_id", "created_at");
CREATE INDEX "stop_edit_logs_stop_id_created_at_idx" ON "stop_edit_logs"("stop_id", "created_at");
CREATE UNIQUE INDEX "provider_cache_cache_key_key" ON "provider_cache"("cache_key");
CREATE INDEX "provider_cache_expires_at_idx" ON "provider_cache"("expires_at");

-- Checks
ALTER TABLE "stops" ADD CONSTRAINT "stops_hub_role_check" CHECK (
    ("kind" = 'hub' AND "hub_role" IS NOT NULL) OR ("kind" <> 'hub' AND "hub_role" IS NULL)
);
ALTER TABLE "medias" ADD CONSTRAINT "medias_owner_check" CHECK ("trip_id" IS NOT NULL OR "stop_id" IS NOT NULL);
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_scope_fk_check" CHECK (
    ("scope" = 'trip' AND "trip_id" IS NOT NULL AND "journey_id" IS NULL AND "stop_id" IS NULL)
    OR ("scope" = 'journey' AND "journey_id" IS NOT NULL AND "trip_id" IS NULL AND "stop_id" IS NULL)
    OR ("scope" = 'stop' AND "stop_id" IS NOT NULL AND "trip_id" IS NULL AND "journey_id" IS NULL)
);
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_one_catalog_fk" CHECK (
    ("kind" = 'flight' AND "catalog_flight_id" IS NOT NULL AND "catalog_hotel_id" IS NULL AND "catalog_event_id" IS NULL AND "catalog_place_id" IS NULL AND "catalog_route_id" IS NULL AND "catalog_weather_id" IS NULL AND "catalog_visa_id" IS NULL AND "catalog_checklist_id" IS NULL)
    OR ("kind" = 'hotel' AND "catalog_hotel_id" IS NOT NULL AND "catalog_flight_id" IS NULL AND "catalog_event_id" IS NULL AND "catalog_place_id" IS NULL AND "catalog_route_id" IS NULL AND "catalog_weather_id" IS NULL AND "catalog_visa_id" IS NULL AND "catalog_checklist_id" IS NULL)
    OR ("kind" = 'event' AND "catalog_event_id" IS NOT NULL AND "catalog_flight_id" IS NULL AND "catalog_hotel_id" IS NULL AND "catalog_place_id" IS NULL AND "catalog_route_id" IS NULL AND "catalog_weather_id" IS NULL AND "catalog_visa_id" IS NULL AND "catalog_checklist_id" IS NULL)
    OR ("kind" = 'place' AND "catalog_place_id" IS NOT NULL AND "catalog_flight_id" IS NULL AND "catalog_hotel_id" IS NULL AND "catalog_event_id" IS NULL AND "catalog_route_id" IS NULL AND "catalog_weather_id" IS NULL AND "catalog_visa_id" IS NULL AND "catalog_checklist_id" IS NULL)
    OR ("kind" = 'route' AND "catalog_route_id" IS NOT NULL AND "catalog_flight_id" IS NULL AND "catalog_hotel_id" IS NULL AND "catalog_event_id" IS NULL AND "catalog_place_id" IS NULL AND "catalog_weather_id" IS NULL AND "catalog_visa_id" IS NULL AND "catalog_checklist_id" IS NULL)
    OR ("kind" = 'weather' AND "catalog_weather_id" IS NOT NULL AND "catalog_flight_id" IS NULL AND "catalog_hotel_id" IS NULL AND "catalog_event_id" IS NULL AND "catalog_place_id" IS NULL AND "catalog_route_id" IS NULL AND "catalog_visa_id" IS NULL AND "catalog_checklist_id" IS NULL)
    OR ("kind" = 'visa' AND "catalog_visa_id" IS NOT NULL AND "catalog_flight_id" IS NULL AND "catalog_hotel_id" IS NULL AND "catalog_event_id" IS NULL AND "catalog_place_id" IS NULL AND "catalog_route_id" IS NULL AND "catalog_weather_id" IS NULL AND "catalog_checklist_id" IS NULL)
    OR ("kind" = 'checklist' AND "catalog_checklist_id" IS NOT NULL AND "catalog_flight_id" IS NULL AND "catalog_hotel_id" IS NULL AND "catalog_event_id" IS NULL AND "catalog_place_id" IS NULL AND "catalog_route_id" IS NULL AND "catalog_weather_id" IS NULL AND "catalog_visa_id" IS NULL)
);

-- Foreign keys
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trips" ADD CONSTRAINT "trips_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trips" ADD CONSTRAINT "trips_cover_media_id_fkey" FOREIGN KEY ("cover_media_id") REFERENCES "medias"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "journeys" ADD CONSTRAINT "journeys_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stops" ADD CONSTRAINT "stops_journey_id_fkey" FOREIGN KEY ("journey_id") REFERENCES "journeys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stops" ADD CONSTRAINT "stops_parent_stop_id_fkey" FOREIGN KEY ("parent_stop_id") REFERENCES "stops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "medias" ADD CONSTRAINT "medias_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "medias" ADD CONSTRAINT "medias_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "stops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_journey_id_fkey" FOREIGN KEY ("journey_id") REFERENCES "journeys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "stops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notes" ADD CONSTRAINT "notes_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notes" ADD CONSTRAINT "notes_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "stops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_flights" ADD CONSTRAINT "catalog_flights_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_hotels" ADD CONSTRAINT "catalog_hotels_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_events" ADD CONSTRAINT "catalog_events_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_visas" ADD CONSTRAINT "catalog_visas_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_weathers" ADD CONSTRAINT "catalog_weathers_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_places" ADD CONSTRAINT "catalog_places_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_routes" ADD CONSTRAINT "catalog_routes_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_checklists" ADD CONSTRAINT "catalog_checklists_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "stops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_catalog_flight_id_fkey" FOREIGN KEY ("catalog_flight_id") REFERENCES "catalog_flights"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_catalog_hotel_id_fkey" FOREIGN KEY ("catalog_hotel_id") REFERENCES "catalog_hotels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_catalog_event_id_fkey" FOREIGN KEY ("catalog_event_id") REFERENCES "catalog_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_catalog_place_id_fkey" FOREIGN KEY ("catalog_place_id") REFERENCES "catalog_places"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_catalog_route_id_fkey" FOREIGN KEY ("catalog_route_id") REFERENCES "catalog_routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_catalog_weather_id_fkey" FOREIGN KEY ("catalog_weather_id") REFERENCES "catalog_weathers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_catalog_visa_id_fkey" FOREIGN KEY ("catalog_visa_id") REFERENCES "catalog_visas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_catalog_checklist_id_fkey" FOREIGN KEY ("catalog_checklist_id") REFERENCES "catalog_checklists"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "trip_alerts" ADD CONSTRAINT "trip_alerts_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trip_alerts" ADD CONSTRAINT "trip_alerts_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "stops"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "application_logs" ADD CONSTRAINT "application_logs_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "application_logs" ADD CONSTRAINT "application_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "saved_places" ADD CONSTRAINT "saved_places_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "saved_places" ADD CONSTRAINT "saved_places_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "saved_places" ADD CONSTRAINT "saved_places_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "stops"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stop_edit_logs" ADD CONSTRAINT "stop_edit_logs_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stop_edit_logs" ADD CONSTRAINT "stop_edit_logs_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "stops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stop_edit_logs" ADD CONSTRAINT "stop_edit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Copy preserved rows. Pipeline itinerary JSON is not converted.
INSERT INTO "users" ("id", "firebase_uid", "email", "display_name", "photo_url", "locale", "home_currency", "created_at", "updated_at")
SELECT
    "id",
    "firebaseUid",
    "email",
    "displayName",
    "photoUrl",
    "locale",
    CASE WHEN char_length("homeCurrency") >= 3 THEN CAST(LEFT("homeCurrency", 3) AS CHAR(3)) ELSE 'IDR' END,
    "createdAt",
    "updatedAt"
FROM "User";

INSERT INTO "user_preferences" (
    "id", "user_id", "budget_max", "budget_style", "pace", "dietary", "interests", "travel_with", "avoid",
    "home_city", "passport_country", "extra", "updated_at"
)
SELECT
    "id",
    "userId",
    "budgetMax",
    "budgetStyle"::text::"budget_style",
    "pace"::text::"pace",
    "dietary",
    "interests",
    "travelWith"::text::"travel_with",
    "avoid",
    NULLIF("extra"->>'originCity', ''),
    CASE
        WHEN char_length(COALESCE("extra"->>'passportCountry', '')) >= 2
        THEN CAST(LEFT(UPPER("extra"->>'passportCountry'), 2) AS CHAR(2))
        ELSE NULL
    END,
    "extra",
    "updatedAt"
FROM "UserPreference";

INSERT INTO "trips" (
    "id", "user_id", "title", "status", "origin_city", "destination_summary", "start_date", "end_date",
    "party_size", "base_currency", "total_cost_amount", "total_cost_is_estimate", "total_duration_minutes",
    "planning_version", "last_planned_at", "created_at", "updated_at"
)
SELECT
    "id",
    "userId",
    "title",
    "status"::text::"trip_status",
    "originCity",
    "destinationSummary",
    "startDate",
    "endDate",
    "partySize",
    CASE WHEN char_length("baseCurrency") >= 3 THEN CAST(LEFT("baseCurrency", 3) AS CHAR(3)) ELSE 'IDR' END,
    "totalCostAmount",
    "totalCostIsEstimate",
    "totalDurationMinutes",
    "planningVersion",
    "lastPlannedAt",
    "createdAt",
    "updatedAt"
FROM "Trip";

INSERT INTO "journeys" ("id", "trip_id", "name", "sort_order", "created_at", "updated_at")
SELECT gen_random_uuid(), "id", "title", 0, "createdAt", "updatedAt"
FROM "Trip";

INSERT INTO "application_logs" (
    "id", "type", "level", "source", "status", "message", "user_id", "trip_id",
    "payload", "result", "error", "duration_ms", "started_at", "completed_at"
)
SELECT
    "id", "type", "level", "source", "status", "message", "userId", "tripId",
    "payload", "result", "error", "durationMs", "startedAt", "completedAt"
FROM "ApplicationLog";

INSERT INTO "trip_alerts" ("id", "trip_id", "stop_id", "kind", "severity", "title", "body", "payload", "is_read", "created_at")
SELECT
    "id",
    "tripId",
    NULL,
    "kind",
    "severity"::text::"alert_severity",
    "title",
    "body",
    "payload",
    "isRead",
    "createdAt"
FROM "TripAlert";

INSERT INTO "provider_cache" ("id", "cache_key", "provider", "tool_name", "request", "response", "expires_at", "created_at")
SELECT "id", "cacheKey", "provider", "toolName", "request", "response", "expiresAt", "createdAt"
FROM "ProviderCache";

INSERT INTO "exchange_rates" ("base", "quote", "rate", "fetched_at")
SELECT CAST(LEFT("base", 3) AS CHAR(3)), CAST(LEFT("quote", 3) AS CHAR(3)), "rate", "fetchedAt"
FROM "ExchangeRate"
WHERE char_length("base") >= 3 AND char_length("quote") >= 3;

INSERT INTO "saved_places" (
    "id", "user_id", "name", "address", "city", "country", "lat", "lng", "source",
    "provider", "provider_ref", "trip_id", "stop_id", "notes", "extra", "created_at", "updated_at"
)
SELECT
    "id", "userId", "name", "address", "city", "country", "lat", "lng", "source",
    "provider", "providerRef", "tripId", NULL, "notes", "extra", "createdAt", "updatedAt"
FROM "SavedPlace";

-- Drop the pipeline tree and the camelCase tables it lived in.
DROP TABLE "SavedPlace" CASCADE;
DROP TABLE "ApplicationLog" CASCADE;
DROP TABLE "TripAlert" CASCADE;
DROP TABLE "PipelineEditLog" CASCADE;
DROP TABLE "PipelineNode" CASCADE;
DROP TABLE "ProviderCache" CASCADE;
DROP TABLE "ExchangeRate" CASCADE;
DROP TABLE "Trip" CASCADE;
DROP TABLE "UserPreference" CASCADE;
DROP TABLE "User" CASCADE;

DROP TYPE "NodeType";
DROP TYPE "CheckpointKind";
DROP TYPE "NodeStatus";
DROP TYPE "NodeOrigin";
DROP TYPE "TripStatus";
DROP TYPE "BudgetStyle";
DROP TYPE "Pace";
DROP TYPE "TravelWith";
DROP TYPE "EditAction";
DROP TYPE "AlertSeverity";
