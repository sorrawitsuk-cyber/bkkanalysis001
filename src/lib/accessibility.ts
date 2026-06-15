export const ACCESSIBILITY_CATEGORIES = [
  "health",
  "education",
  "food",
  "recreation",
  "transit",
] as const;

export type AccessibilityCategory = (typeof ACCESSIBILITY_CATEGORIES)[number];
export type AccessibilityMetric =
  | "accessibility_score"
  | "complete_coverage_pct"
  | AccessibilityCategory;
export type AccessibilityBasis = "population" | "area";
export type AccessibilityScenario = "standard" | "inclusive" | "cycling";

export const ACCESSIBILITY_LABELS: Record<AccessibilityCategory, string> = {
  health: "สุขภาพ",
  education: "การศึกษา",
  food: "อาหารและตลาด",
  recreation: "นันทนาการ",
  transit: "ขนส่งสาธารณะ",
};

export const ACCESSIBILITY_SUBTYPE_LABELS: Record<string, string> = {
  health: "ศูนย์บริการสาธารณสุข",
  education: "โรงเรียน กทม.",
  food: "ตลาด",
  park: "สวนสาธารณะ",
  library: "ห้องสมุด",
  sport: "ศูนย์กีฬา",
  bts: "สถานี BTS",
  mrt: "สถานี MRT",
  brt: "สถานี BRT",
  bus_stop: "ป้ายรถเมล์",
  sansab_pier: "ท่าเรือคลองแสนแสบ",
  chao_phraya_pier: "ท่าเรือเจ้าพระยา",
};

export interface AccessibilityCategoryMetric {
  coverage_pct: number;
  inclusive_coverage_pct: number;
  cycling_coverage_pct: number;
  area_coverage_pct: number;
  inclusive_area_coverage_pct: number;
  cycling_area_coverage_pct: number;
  median_minutes: number | null;
  p90_minutes: number | null;
  inclusive_median_minutes: number | null;
  inclusive_p90_minutes: number | null;
  cycling_median_minutes: number | null;
  cycling_p90_minutes: number | null;
  area_median_minutes: number | null;
  area_p90_minutes: number | null;
  inclusive_area_median_minutes: number | null;
  inclusive_area_p90_minutes: number | null;
  cycling_area_median_minutes: number | null;
  cycling_area_p90_minutes: number | null;
  covered_population: number;
  inclusive_covered_population: number;
  cycling_covered_population: number;
  service_count: number;
}

export interface AccessibilityDistrict {
  district_id: number;
  district_name: string;
  population: number;
  sample_count: number;
  service_count: number;
  services_per_10000: number | null;
  accessibility_score: number;
  inclusive_accessibility_score: number;
  cycling_accessibility_score: number;
  area_accessibility_score: number;
  inclusive_area_accessibility_score: number;
  cycling_area_accessibility_score: number;
  complete_coverage_pct: number;
  inclusive_complete_coverage_pct: number;
  cycling_complete_coverage_pct: number;
  area_complete_coverage_pct: number;
  inclusive_area_complete_coverage_pct: number;
  cycling_area_complete_coverage_pct: number;
  complete_covered_population: number;
  cycling_complete_covered_population: number;
  underserved_population: number;
  represented_population: number;
  rank: number;
  categories: Record<AccessibilityCategory, AccessibilityCategoryMetric>;
}

export interface AccessibilityService {
  id: string;
  category: AccessibilityCategory;
  subtype: string;
  name: string;
  lat: number;
  lng: number;
  district_id: number | null;
  district_name: string | null;
  source: string;
}

export function accessibilityValue(
  district: AccessibilityDistrict,
  metric: AccessibilityMetric,
  basis: AccessibilityBasis = "population",
  scenario: AccessibilityScenario = "standard",
): number {
  if (metric in district.categories) {
    const category = district.categories[metric as AccessibilityCategory];
    if (basis === "area") {
      if (scenario === "cycling") return category.cycling_area_coverage_pct;
      if (scenario === "inclusive") return category.inclusive_area_coverage_pct;
      return category.area_coverage_pct;
    }
    if (scenario === "cycling") return category.cycling_coverage_pct;
    if (scenario === "inclusive") return category.inclusive_coverage_pct;
    return category.coverage_pct;
  }
  if (metric === "complete_coverage_pct") {
    if (basis === "area") {
      if (scenario === "cycling") return district.cycling_area_complete_coverage_pct;
      if (scenario === "inclusive") return district.inclusive_area_complete_coverage_pct;
      return district.area_complete_coverage_pct;
    }
    if (scenario === "cycling") return district.cycling_complete_coverage_pct;
    if (scenario === "inclusive") return district.inclusive_complete_coverage_pct;
    return district.complete_coverage_pct;
  }
  if (basis === "area") {
    if (scenario === "cycling") return district.cycling_area_accessibility_score;
    if (scenario === "inclusive") return district.inclusive_area_accessibility_score;
    return district.area_accessibility_score;
  }
  if (scenario === "cycling") return district.cycling_accessibility_score;
  if (scenario === "inclusive") return district.inclusive_accessibility_score;
  return district.accessibility_score;
}

export function accessibilityColor(value: number): string {
  if (value >= 80) return "#047857";
  if (value >= 60) return "#10b981";
  if (value >= 40) return "#facc15";
  if (value >= 20) return "#f97316";
  return "#b91c1c";
}

export function accessibilityLevel(value: number): string {
  if (value >= 80) return "เข้าถึงสูงมาก";
  if (value >= 60) return "เข้าถึงสูง";
  if (value >= 40) return "ปานกลาง";
  if (value >= 20) return "เข้าถึงต่ำ";
  return "เข้าถึงต่ำมาก";
}
