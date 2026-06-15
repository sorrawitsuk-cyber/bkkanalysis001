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
export type AccessibilityScenario = "standard" | "inclusive";

export const ACCESSIBILITY_LABELS: Record<AccessibilityCategory, string> = {
  health: "สุขภาพ",
  education: "การศึกษา",
  food: "อาหารและตลาด",
  recreation: "นันทนาการ",
  transit: "ขนส่งสาธารณะ",
};

export interface AccessibilityCategoryMetric {
  coverage_pct: number;
  inclusive_coverage_pct: number;
  area_coverage_pct: number;
  inclusive_area_coverage_pct: number;
  median_minutes: number | null;
  p90_minutes: number | null;
  area_median_minutes: number | null;
  area_p90_minutes: number | null;
  covered_population: number;
  inclusive_covered_population: number;
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
  area_accessibility_score: number;
  inclusive_area_accessibility_score: number;
  complete_coverage_pct: number;
  inclusive_complete_coverage_pct: number;
  area_complete_coverage_pct: number;
  inclusive_area_complete_coverage_pct: number;
  complete_covered_population: number;
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
      return scenario === "inclusive"
        ? category.inclusive_area_coverage_pct
        : category.area_coverage_pct;
    }
    return scenario === "inclusive"
      ? category.inclusive_coverage_pct
      : category.coverage_pct;
  }
  if (metric === "complete_coverage_pct") {
    if (basis === "area") {
      return scenario === "inclusive"
        ? district.inclusive_area_complete_coverage_pct
        : district.area_complete_coverage_pct;
    }
    return scenario === "inclusive"
      ? district.inclusive_complete_coverage_pct
      : district.complete_coverage_pct;
  }
  if (basis === "area") {
    return scenario === "inclusive"
      ? district.inclusive_area_accessibility_score
      : district.area_accessibility_score;
  }
  return scenario === "inclusive"
    ? district.inclusive_accessibility_score
    : district.accessibility_score;
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
