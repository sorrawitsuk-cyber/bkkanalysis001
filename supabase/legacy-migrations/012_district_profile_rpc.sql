-- Legacy migration retained for audit; not part of linked CLI history.
-- Migration 012: RPC functions for efficient per-district data access
-- All functions use SECURITY DEFINER so anon key can call them (bypasses RLS on behalf of service role).
-- Created: 2026-05-29

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. get_district_profile(p_district_id)
--    Returns district rows + BKK yearly averages in ONE round-trip using UNION ALL.
--    row_type = 'district' | 'bkk_avg'
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS get_district_profile(integer);

CREATE OR REPLACE FUNCTION get_district_profile(p_district_id integer)
RETURNS TABLE(
  row_type             text,
  year                 integer,
  mean_lst             double precision,
  max_lst              double precision,
  ndvi_mean            double precision,
  ndvi_score           double precision,
  green_area_rai       double precision,
  green_area_ratio     double precision,
  low_green_ratio      double precision,
  ndbi_mean            double precision,
  ndbi_max             double precision,
  no2_mean             double precision,
  no2_max              double precision,
  co_mean              double precision,
  co_max               double precision,
  so2_mean             double precision,
  so2_max              double precision,
  aerosol_index_mean   double precision,
  aerosol_index_max    double precision,
  pollution_score      double precision,
  water_ratio          double precision,
  water_area_rai       double precision,
  ndwi_mean            double precision,
  ntl_mean             double precision,
  ntl_max              double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  -- District-specific rows (typically ≤ 9 rows)
  SELECT
    'district'::text          AS row_type,
    ds.year,
    ds.mean_lst,
    ds.max_lst,
    ds.ndvi_mean,
    ds.ndvi_score::double precision,
    ds.green_area_rai::double precision,
    ds.green_area_ratio,
    ds.low_green_ratio,
    ds.ndbi_mean,
    ds.ndbi_max,
    ds.no2_mean,
    ds.no2_max,
    ds.co_mean,
    ds.co_max,
    ds.so2_mean,
    ds.so2_max,
    ds.aerosol_index_mean,
    ds.aerosol_index_max,
    ds.pollution_score,
    ds.water_ratio,
    ds.water_area_rai::double precision,
    ds.ndwi_mean,
    ds.ntl_mean,
    ds.ntl_max
  FROM district_statistics ds
  WHERE ds.district_id = p_district_id

  UNION ALL

  -- Bangkok-wide averages from the pre-aggregated materialized view (≤ 9 rows)
  SELECT
    'bkk_avg'::text           AS row_type,
    bka.year,
    bka.mean_lst,
    bka.max_lst,
    bka.ndvi_mean,
    bka.ndvi_score,
    bka.green_area_rai,
    bka.green_area_ratio,
    bka.low_green_ratio,
    bka.ndbi_mean,
    bka.ndbi_max,
    bka.no2_mean,
    bka.no2_max,
    bka.co_mean,
    bka.co_max,
    bka.so2_mean,
    bka.so2_max,
    bka.aerosol_index_mean,
    bka.aerosol_index_max,
    bka.pollution_score,
    bka.water_ratio,
    bka.water_area_rai,
    bka.ndwi_mean,
    bka.ntl_mean,
    bka.ntl_max
  FROM bkk_yearly_averages bka

  ORDER BY row_type DESC, year ASC;  -- 'district' > 'bkk_avg' alphabetically
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. get_district_trend(p_district_id)
--    Returns all-years rows for ONE district only (used in district-metrics
--    summaryData when a district filter is active).
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS get_district_trend(integer);

CREATE OR REPLACE FUNCTION get_district_trend(p_district_id integer)
RETURNS TABLE(
  district_id          integer,
  year                 integer,
  mean_lst             double precision,
  max_lst              double precision,
  ndvi_mean            double precision,
  ndvi_score           double precision,
  green_area_rai       double precision,
  green_area_ratio     double precision,
  low_green_ratio      double precision,
  ndbi_mean            double precision,
  no2_mean             double precision,
  co_mean              double precision,
  so2_mean             double precision,
  pollution_score      double precision,
  water_ratio          double precision,
  water_area_rai       double precision,
  ndwi_mean            double precision,
  ntl_mean             double precision,
  ntl_max              double precision,
  district_name        text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    ds.district_id,
    ds.year,
    ds.mean_lst,
    ds.max_lst,
    ds.ndvi_mean,
    ds.ndvi_score::double precision,
    ds.green_area_rai::double precision,
    ds.green_area_ratio,
    ds.low_green_ratio,
    ds.ndbi_mean,
    ds.no2_mean,
    ds.co_mean,
    ds.so2_mean,
    ds.pollution_score,
    ds.water_ratio,
    ds.water_area_rai::double precision,
    ds.ndwi_mean,
    ds.ntl_mean,
    ds.ntl_max,
    d.name_th AS district_name
  FROM district_statistics ds
  LEFT JOIN districts d ON d.id = ds.district_id
  WHERE ds.district_id = p_district_id
  ORDER BY ds.year ASC;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. get_district_ranking(p_year, p_metric)
--    Returns all 50 districts sorted by the requested metric for a given year.
--    Avoids fetching all columns when only one metric is needed.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS get_district_ranking(integer, text);

CREATE OR REPLACE FUNCTION get_district_ranking(p_year integer, p_metric text)
RETURNS TABLE(
  district_id   integer,
  district_name text,
  metric_value  double precision,
  rank_asc      bigint,
  rank_desc     bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ds.district_id,
    d.name_th::text AS district_name,
    CASE p_metric
      WHEN 'vegetation'    THEN ds.ndvi_mean
      WHEN 'lst'           THEN ds.mean_lst
      WHEN 'builtup'       THEN ds.ndbi_mean
      WHEN 'no2'           THEN ds.no2_mean
      WHEN 'co'            THEN ds.co_mean
      WHEN 'so2'           THEN ds.so2_mean
      WHEN 'aerosol'       THEN ds.aerosol_index_mean
      WHEN 'pollution'     THEN ds.pollution_score
      WHEN 'nightlights'   THEN ds.ntl_mean
      WHEN 'green_area'    THEN ds.green_area_ratio
      WHEN 'ndwi'          THEN ds.ndwi_mean
      ELSE ds.ndvi_mean
    END AS metric_value,
    RANK() OVER (ORDER BY
      CASE p_metric
        WHEN 'vegetation'  THEN ds.ndvi_mean
        WHEN 'lst'         THEN ds.mean_lst
        WHEN 'builtup'     THEN ds.ndbi_mean
        WHEN 'no2'         THEN ds.no2_mean
        WHEN 'co'          THEN ds.co_mean
        WHEN 'so2'         THEN ds.so2_mean
        WHEN 'aerosol'     THEN ds.aerosol_index_mean
        WHEN 'pollution'   THEN ds.pollution_score
        WHEN 'nightlights' THEN ds.ntl_mean
        WHEN 'green_area'  THEN ds.green_area_ratio
        WHEN 'ndwi'        THEN ds.ndwi_mean
        ELSE ds.ndvi_mean
      END ASC NULLS LAST
    ) AS rank_asc,
    RANK() OVER (ORDER BY
      CASE p_metric
        WHEN 'vegetation'  THEN ds.ndvi_mean
        WHEN 'lst'         THEN ds.mean_lst
        WHEN 'builtup'     THEN ds.ndbi_mean
        WHEN 'no2'         THEN ds.no2_mean
        WHEN 'co'          THEN ds.co_mean
        WHEN 'so2'         THEN ds.so2_mean
        WHEN 'aerosol'     THEN ds.aerosol_index_mean
        WHEN 'pollution'   THEN ds.pollution_score
        WHEN 'nightlights' THEN ds.ntl_mean
        WHEN 'green_area'  THEN ds.green_area_ratio
        WHEN 'ndwi'        THEN ds.ndwi_mean
        ELSE ds.ndvi_mean
      END DESC NULLS LAST
    ) AS rank_desc
  FROM district_statistics ds
  LEFT JOIN districts d ON d.id = ds.district_id
  WHERE ds.year = p_year
  ORDER BY metric_value DESC NULLS LAST;
END;
$$;

-- Grant execute to anon + authenticated (functions are SECURITY DEFINER so they run as owner)
GRANT EXECUTE ON FUNCTION get_district_profile(integer)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_district_trend(integer)     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_district_ranking(integer, text) TO anon, authenticated;
