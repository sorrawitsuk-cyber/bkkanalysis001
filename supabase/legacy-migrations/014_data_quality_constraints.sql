-- Legacy migration retained for audit; not part of linked CLI history.
-- Data-quality guardrails for district_statistics.
-- These constraints allow NULL when a product is unavailable.

ALTER TABLE district_statistics
  ADD CONSTRAINT district_statistics_ndvi_range
    CHECK (
      (ndvi_mean IS NULL OR ndvi_mean BETWEEN -1 AND 1) AND
      (ndvi_min IS NULL OR ndvi_min BETWEEN -1 AND 1) AND
      (ndvi_max IS NULL OR ndvi_max BETWEEN -1 AND 1)
    ) NOT VALID,
  ADD CONSTRAINT district_statistics_ndvi_order
    CHECK (
      ndvi_min IS NULL OR ndvi_mean IS NULL OR ndvi_max IS NULL OR
      (ndvi_min <= ndvi_mean AND ndvi_mean <= ndvi_max)
    ) NOT VALID,
  ADD CONSTRAINT district_statistics_ndbi_range
    CHECK (
      (ndbi_mean IS NULL OR ndbi_mean BETWEEN -1 AND 1) AND
      (ndbi_max IS NULL OR ndbi_max BETWEEN -1 AND 1)
    ) NOT VALID,
  ADD CONSTRAINT district_statistics_ndbi_order
    CHECK (ndbi_mean IS NULL OR ndbi_max IS NULL OR ndbi_mean <= ndbi_max) NOT VALID,
  ADD CONSTRAINT district_statistics_ratio_range
    CHECK (
      (water_ratio IS NULL OR water_ratio BETWEEN 0 AND 1) AND
      (green_area_ratio IS NULL OR green_area_ratio BETWEEN 0 AND 1) AND
      (low_green_ratio IS NULL OR low_green_ratio BETWEEN 0 AND 1)
    ) NOT VALID,
  ADD CONSTRAINT district_statistics_lst_order
    CHECK (mean_lst IS NULL OR max_lst IS NULL OR mean_lst <= max_lst) NOT VALID,
  ADD CONSTRAINT district_statistics_ntl_values
    CHECK (
      (ntl_mean IS NULL OR ntl_mean >= 0) AND
      (ntl_max IS NULL OR ntl_max >= 0) AND
      (ntl_mean IS NULL OR ntl_max IS NULL OR ntl_mean <= ntl_max)
    ) NOT VALID,
  ADD CONSTRAINT district_statistics_pollution_score_range
    CHECK (pollution_score IS NULL OR pollution_score BETWEEN 0 AND 10) NOT VALID,
  ADD CONSTRAINT district_statistics_area_nonnegative
    CHECK (
      (green_area_rai IS NULL OR green_area_rai >= 0) AND
      (water_area_rai IS NULL OR water_area_rai >= 0)
    ) NOT VALID;

ALTER TABLE district_statistics VALIDATE CONSTRAINT district_statistics_ndvi_range;
ALTER TABLE district_statistics VALIDATE CONSTRAINT district_statistics_ndvi_order;
ALTER TABLE district_statistics VALIDATE CONSTRAINT district_statistics_ndbi_range;
ALTER TABLE district_statistics VALIDATE CONSTRAINT district_statistics_ndbi_order;
ALTER TABLE district_statistics VALIDATE CONSTRAINT district_statistics_ratio_range;
ALTER TABLE district_statistics VALIDATE CONSTRAINT district_statistics_lst_order;
ALTER TABLE district_statistics VALIDATE CONSTRAINT district_statistics_ntl_values;
ALTER TABLE district_statistics VALIDATE CONSTRAINT district_statistics_pollution_score_range;
ALTER TABLE district_statistics VALIDATE CONSTRAINT district_statistics_area_nonnegative;
