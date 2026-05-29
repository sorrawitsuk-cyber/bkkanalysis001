// Urban-context NDVI classes (Zhu et al. 2023 adapted thresholds):
// Very Low  < 0.10 — bare/impervious
// Low       0.10–0.20 — sparse urban green
// Urban     0.20–0.35 — urban canopy / mixed vegetation
// Park      0.35–0.50 — park / dense urban tree cover
// Forest    ≥ 0.50 — dense forest / water-adjacent vegetation
export type NdviClass =
  | "Very Low"
  | "Low"
  | "Urban Green"
  | "Park"
  | "Forest"
  | "Unknown";

export interface DistrictStatistic {
  id?: number;
  district_id: number;
  district_name?: string | null;
  name_th?: string | null;
  name_en?: string | null;
  year: number;
  ndvi_mean?: number | null;
  ndvi_median?: number | null;
  ndvi_min?: number | null;
  ndvi_max?: number | null;
  ndvi_score?: number | null;
  ndvi_class?: NdviClass | string | null;
  green_area_ratio?: number | null;
  green_area_rai?: number | null;
  low_green_ratio?: number | null;
  water_ratio?: number | null;
  ntl_mean?: number | null;
  mean_lst?: number | null;
  max_lst?: number | null;
  ndbi_mean?: number | null;
  ndbi_max?: number | null;
  no2_mean?: number | null;
  no2_max?: number | null;
  co_mean?: number | null;
  co_max?: number | null;
  so2_mean?: number | null;
  so2_max?: number | null;
  aerosol_index_mean?: number | null;
  aerosol_index_max?: number | null;
  pollution_score?: number | null;
  pollution_class?: string | null;
  air_quality_source?: string | null;
  air_quality_note?: string | null;
  monthly_lst?: number[] | null;
  lst_data_source?: string | null;
  population?: number | null;
  density?: number | null;
  growth_rate?: number | null;
  accessibility_index?: number | null;
  data_source?: string | null;
  processing_note?: string | null;
  ndvi?: number | null;
  vegetation_index?: number | null;
}

export interface BangkokNdviSummary {
  year: number;
  avg_ndvi_mean: number | null;
  avg_ndvi_score: number | null;
  total_green_area_rai: number | null;
  avg_green_area_ratio: number | null;
  best_district: DistrictStatistic | null;
  worst_district: DistrictStatistic | null;
  most_declining_district: DistrictStatistic | null;
}
