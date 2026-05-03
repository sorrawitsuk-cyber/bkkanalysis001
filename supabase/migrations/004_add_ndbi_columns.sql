-- Add Normalized Difference Built-up Index (NDBI) columns to district_statistics
-- Safe to run multiple times.

ALTER TABLE district_statistics ADD COLUMN IF NOT EXISTS ndbi_mean        DOUBLE PRECISION;
ALTER TABLE district_statistics ADD COLUMN IF NOT EXISTS ndbi_max         DOUBLE PRECISION;
ALTER TABLE district_statistics ADD COLUMN IF NOT EXISTS ndbi_data_source TEXT;

CREATE INDEX IF NOT EXISTS district_statistics_ndbi_mean_idx
  ON district_statistics (ndbi_mean);
