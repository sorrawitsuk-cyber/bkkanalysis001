-- Migration 013: Additional performance indexes + RLS for bkk_yearly_averages
-- Created: 2026-05-29

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Composite indexes on district_statistics for common query patterns
-- ─────────────────────────────────────────────────────────────────────────────

-- Single-district all-years query (used by get_district_profile, get_district_trend)
CREATE INDEX IF NOT EXISTS idx_ds_district_year
  ON district_statistics (district_id, year ASC);

-- Single-year all-districts query (used by district-metrics choropleth)
CREATE INDEX IF NOT EXISTS idx_ds_year_district
  ON district_statistics (year, district_id);

-- Partial index for non-null ndvi_mean rankings (frequent sort column)
CREATE INDEX IF NOT EXISTS idx_ds_year_ndvi
  ON district_statistics (year, ndvi_mean DESC)
  WHERE ndvi_mean IS NOT NULL;

-- Partial index for non-null mean_lst rankings
CREATE INDEX IF NOT EXISTS idx_ds_year_lst
  ON district_statistics (year, mean_lst DESC)
  WHERE mean_lst IS NOT NULL;

-- Partial index for non-null no2_mean (air quality)
CREATE INDEX IF NOT EXISTS idx_ds_year_no2
  ON district_statistics (year, no2_mean DESC)
  WHERE no2_mean IS NOT NULL;

-- Partial index for non-null ntl_mean (nighttime lights)
CREATE INDEX IF NOT EXISTS idx_ds_year_ntl
  ON district_statistics (year, ntl_mean DESC)
  WHERE ntl_mean IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Read policy for bkk_yearly_averages materialized view
--    Materialized views don't inherit RLS from the base table, so we need
--    an explicit grant. Views in Postgres don't support RLS directly —
--    the GRANT is sufficient since the MV is read-only.
-- ─────────────────────────────────────────────────────────────────────────────
GRANT SELECT ON bkk_yearly_averages TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Read policy for districts table (needed for JOIN in RPCs)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE districts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_anon_read_districts" ON districts;
CREATE POLICY "allow_anon_read_districts"
  ON districts FOR SELECT
  TO anon, authenticated
  USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. EXPLAIN ANALYZE hints (comments only — run manually to verify plans)
-- ─────────────────────────────────────────────────────────────────────────────
-- EXPLAIN ANALYZE SELECT * FROM get_district_profile(1);
-- EXPLAIN ANALYZE SELECT * FROM get_district_trend(1);
-- EXPLAIN ANALYZE SELECT * FROM get_district_ranking(2024, 'vegetation');
-- EXPLAIN ANALYZE SELECT * FROM district_statistics WHERE district_id = 1 ORDER BY year;
-- EXPLAIN ANALYZE SELECT * FROM district_statistics WHERE year = 2024;
