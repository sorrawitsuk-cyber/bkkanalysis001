-- Satellite air pollution metrics for district_statistics.
-- Safe to run multiple times.

ALTER TABLE district_statistics
  ADD COLUMN IF NOT EXISTS no2_mean DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS no2_max DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS co_mean DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS co_max DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS so2_mean DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS so2_max DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS aerosol_index_mean DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS aerosol_index_max DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS pollution_score DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS pollution_class TEXT,
  ADD COLUMN IF NOT EXISTS air_quality_source TEXT,
  ADD COLUMN IF NOT EXISTS air_quality_note TEXT;

CREATE INDEX IF NOT EXISTS district_statistics_no2_mean_idx
  ON district_statistics (year, no2_mean);

CREATE INDEX IF NOT EXISTS district_statistics_pollution_score_idx
  ON district_statistics (year, pollution_score);
;
