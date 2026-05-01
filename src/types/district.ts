export type NdviClass =
  | "Very Low"
  | "Low"
  | "Moderate"
  | "Good"
  | "Very Good"
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
