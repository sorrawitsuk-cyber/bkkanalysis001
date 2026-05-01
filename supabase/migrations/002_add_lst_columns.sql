-- Add Land Surface Temperature (LST) columns to district_statistics
-- Safe to run multiple times.

ALTER TABLE district_statistics ADD COLUMN IF NOT EXISTS mean_lst        DOUBLE PRECISION;
ALTER TABLE district_statistics ADD COLUMN IF NOT EXISTS max_lst         DOUBLE PRECISION;
ALTER TABLE district_statistics ADD COLUMN IF NOT EXISTS monthly_lst     DOUBLE PRECISION[];
ALTER TABLE district_statistics ADD COLUMN IF NOT EXISTS lst_data_source TEXT;

CREATE INDEX IF NOT EXISTS district_statistics_mean_lst_idx
  ON district_statistics (mean_lst);
