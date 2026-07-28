-- Legacy migration retained for audit; not part of linked CLI history.
-- Add NDVI columns to district_statistics for GEE-computed vegetation data
-- Safe to run multiple times.

ALTER TABLE district_statistics ADD COLUMN IF NOT EXISTS ndvi_mean        DOUBLE PRECISION;
ALTER TABLE district_statistics ADD COLUMN IF NOT EXISTS ndvi_max         DOUBLE PRECISION;
ALTER TABLE district_statistics ADD COLUMN IF NOT EXISTS ndvi_data_source TEXT;

CREATE INDEX IF NOT EXISTS district_statistics_ndvi_mean_idx
  ON district_statistics (ndvi_mean);
