-- Sub-district (แขวง) statistics table — mirrors district_statistics at finer granularity.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS subdistrict_statistics (
    id               BIGSERIAL PRIMARY KEY,
    subdistrict_id   INT NOT NULL,
    subdistrict_name TEXT,
    district_id      INT NOT NULL,
    district_name    TEXT,
    year             INT NOT NULL,
    -- Nighttime Lights (VIIRS DNB)
    ntl_mean         DOUBLE PRECISION,
    ntl_max          DOUBLE PRECISION,
    -- Land Surface Temperature (LST)
    mean_lst         DOUBLE PRECISION,
    max_lst          DOUBLE PRECISION,
    -- NDVI / green space
    ndvi_mean        DOUBLE PRECISION,
    ndvi_max         DOUBLE PRECISION,
    green_area_ratio DOUBLE PRECISION,
    green_area_rai   DOUBLE PRECISION,
    -- NDBI / built-up
    ndbi_mean        DOUBLE PRECISION,
    ndbi_max         DOUBLE PRECISION,
    -- Water indices (Sentinel-2)
    water_ratio      DOUBLE PRECISION,
    ndwi_mean        DOUBLE PRECISION,
    mndwi_mean       DOUBLE PRECISION,
    -- Metadata
    data_source      TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (subdistrict_id, year)
);

CREATE INDEX IF NOT EXISTS subdistrict_statistics_district_year_idx ON subdistrict_statistics (district_id, year);
CREATE INDEX IF NOT EXISTS subdistrict_statistics_year_idx          ON subdistrict_statistics (year);
CREATE INDEX IF NOT EXISTS subdistrict_statistics_ntl_mean_idx      ON subdistrict_statistics (ntl_mean);

CREATE OR REPLACE FUNCTION set_subdistrict_statistics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS subdistrict_statistics_set_updated_at ON subdistrict_statistics;
CREATE TRIGGER subdistrict_statistics_set_updated_at
BEFORE UPDATE ON subdistrict_statistics
FOR EACH ROW EXECUTE FUNCTION set_subdistrict_statistics_updated_at();

-- Allow anonymous read (same policy as district_statistics)
ALTER TABLE subdistrict_statistics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon can read subdistrict_statistics" ON subdistrict_statistics;
CREATE POLICY "anon can read subdistrict_statistics"
  ON subdistrict_statistics FOR SELECT USING (true);
