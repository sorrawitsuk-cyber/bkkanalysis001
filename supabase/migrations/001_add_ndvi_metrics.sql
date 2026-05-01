-- NDVI metric expansion for Bangkok District Analytics Dashboard.
-- Safe to run multiple times in Supabase SQL Editor.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS district_statistics (
    id BIGSERIAL PRIMARY KEY,
    district_id INT NOT NULL,
    year INT NOT NULL,
    population INT,
    growth_rate DOUBLE PRECISION,
    density DOUBLE PRECISION,
    accessibility_index DOUBLE PRECISION,
    ndvi_score DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE district_statistics ADD COLUMN IF NOT EXISTS ndvi_mean DOUBLE PRECISION;
ALTER TABLE district_statistics ADD COLUMN IF NOT EXISTS ndvi_median DOUBLE PRECISION;
ALTER TABLE district_statistics ADD COLUMN IF NOT EXISTS ndvi_min DOUBLE PRECISION;
ALTER TABLE district_statistics ADD COLUMN IF NOT EXISTS ndvi_max DOUBLE PRECISION;
ALTER TABLE district_statistics ADD COLUMN IF NOT EXISTS ndvi_score DOUBLE PRECISION;
ALTER TABLE district_statistics ADD COLUMN IF NOT EXISTS ndvi_class TEXT;
ALTER TABLE district_statistics ADD COLUMN IF NOT EXISTS green_area_ratio DOUBLE PRECISION;
ALTER TABLE district_statistics ADD COLUMN IF NOT EXISTS green_area_rai DOUBLE PRECISION;
ALTER TABLE district_statistics ADD COLUMN IF NOT EXISTS low_green_ratio DOUBLE PRECISION;
ALTER TABLE district_statistics ADD COLUMN IF NOT EXISTS water_ratio DOUBLE PRECISION;
ALTER TABLE district_statistics ADD COLUMN IF NOT EXISTS ntl_mean DOUBLE PRECISION;
ALTER TABLE district_statistics ADD COLUMN IF NOT EXISTS data_source TEXT;
ALTER TABLE district_statistics ADD COLUMN IF NOT EXISTS processing_note TEXT;
ALTER TABLE district_statistics ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE district_statistics ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'district_statistics_district_id_year_key'
      AND conrelid = 'district_statistics'::regclass
  ) THEN
    ALTER TABLE district_statistics
      ADD CONSTRAINT district_statistics_district_id_year_key UNIQUE (district_id, year);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION set_district_statistics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS district_statistics_set_updated_at ON district_statistics;
CREATE TRIGGER district_statistics_set_updated_at
BEFORE UPDATE ON district_statistics
FOR EACH ROW
EXECUTE FUNCTION set_district_statistics_updated_at();

CREATE INDEX IF NOT EXISTS district_statistics_year_idx
  ON district_statistics (year);

CREATE INDEX IF NOT EXISTS district_statistics_district_year_idx
  ON district_statistics (district_id, year);

CREATE INDEX IF NOT EXISTS district_statistics_ndvi_score_idx
  ON district_statistics (ndvi_score);
