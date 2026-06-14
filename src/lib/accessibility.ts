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
  | "inclusive_complete_coverage_pct"
  | AccessibilityCategory;

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
  median_minutes: number | null;
  p90_minutes: number | null;
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
  complete_coverage_pct: number;
  inclusive_complete_coverage_pct: number;
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
): number {
  if (metric in district.categories) {
    return district.categories[metric as AccessibilityCategory].coverage_pct;
  }
  return district[metric as Exclude<AccessibilityMetric, AccessibilityCategory>];
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
