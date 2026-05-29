-- Migration 011: Materialized view for Bangkok-wide yearly averages
-- Replaces the 450-row full-table scan in district-profile route with a 9-row lookup.
-- Created: 2026-05-29

-- 1. Create the materialized view
DROP MATERIALIZED VIEW IF EXISTS bkk_yearly_averages;

CREATE MATERIALIZED VIEW bkk_yearly_averages AS
SELECT
  year,
  COUNT(*)                        AS district_count,

  -- Thermal
  AVG(mean_lst)                   AS mean_lst,
  AVG(max_lst)                    AS max_lst,

  -- Vegetation
  AVG(ndvi_mean)                  AS ndvi_mean,
  AVG(ndvi_score)                 AS ndvi_score,
  AVG(green_area_rai)             AS green_area_rai,
  AVG(green_area_ratio)           AS green_area_ratio,
  AVG(low_green_ratio)            AS low_green_ratio,

  -- Built-up
  AVG(ndbi_mean)                  AS ndbi_mean,
  AVG(ndbi_max)                   AS ndbi_max,

  -- Air quality
  AVG(no2_mean)                   AS no2_mean,
  AVG(no2_max)                    AS no2_max,
  AVG(co_mean)                    AS co_mean,
  AVG(co_max)                     AS co_max,
  AVG(so2_mean)                   AS so2_mean,
  AVG(so2_max)                    AS so2_max,
  AVG(aerosol_index_mean)         AS aerosol_index_mean,
  AVG(aerosol_index_max)          AS aerosol_index_max,
  AVG(pollution_score)            AS pollution_score,

  -- Water / flood
  AVG(water_ratio)                AS water_ratio,
  AVG(water_area_rai)             AS water_area_rai,
  AVG(ndwi_mean)                  AS ndwi_mean,

  -- Nighttime lights
  AVG(ntl_mean)                   AS ntl_mean,
  AVG(ntl_max)                    AS ntl_max
FROM district_statistics
GROUP BY year
ORDER BY year;

-- 2. Unique index on year (required for CONCURRENT refresh)
CREATE UNIQUE INDEX bkk_yearly_averages_year_idx ON bkk_yearly_averages (year);

-- 3. Refresh function (CONCURRENTLY = no lock on reads during refresh)
CREATE OR REPLACE FUNCTION refresh_bkk_yearly_averages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY bkk_yearly_averages;
END;
$$;

-- 4. Trigger function that queues a refresh after any write to district_statistics
--    Uses pg_notify so the refresh can be handled async if needed;
--    also calls refresh directly (acceptable latency for infrequent bulk loads).
CREATE OR REPLACE FUNCTION trg_refresh_bkk_averages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM refresh_bkk_yearly_averages();
  RETURN NULL;
END;
$$;

-- Drop existing trigger if any, then recreate
DROP TRIGGER IF EXISTS after_district_statistics_change ON district_statistics;

CREATE TRIGGER after_district_statistics_change
  AFTER INSERT OR UPDATE OR DELETE
  ON district_statistics
  FOR EACH STATEMENT
  EXECUTE FUNCTION trg_refresh_bkk_averages();

-- 5. Initial population
REFRESH MATERIALIZED VIEW bkk_yearly_averages;
