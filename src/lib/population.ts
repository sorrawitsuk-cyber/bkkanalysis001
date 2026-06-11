export const POPULATION_MIN_YEAR = 2018;
export const POPULATION_MAX_YEAR = 2025;

export type PopulationLevel = "district" | "subdistrict";
export type PopulationMetric = "population" | "density" | "change_pct" | "houses";

export interface PopulationRow {
  id: number;
  level: PopulationLevel;
  name: string;
  name_en: string | null;
  district_id: number;
  district_name: string;
  population: number;
  male: number;
  female: number;
  houses: number;
  area_km2: number;
  density: number;
  sex_ratio: number | null;
  people_per_house: number | null;
  change_abs: number | null;
  change_pct: number | null;
  share_pct: number;
}

export interface PopulationResponse {
  year: number;
  previousYear: number | null;
  level: PopulationLevel;
  availableYears: number[];
  rows: PopulationRow[];
  geojson: {
    type: "FeatureCollection";
    features: Array<Record<string, unknown>>;
  };
  trend: Array<{
    year: number;
    population: number;
    male: number;
    female: number;
    houses: number;
  }>;
  summary: {
    population: number;
    male: number;
    female: number;
    houses: number;
    areaKm2: number;
    density: number;
    changeAbs: number | null;
    changePct: number | null;
    femaleSharePct: number;
    mostPopulous: string | null;
    highestDensity: string | null;
    fastestGrowing: string | null;
    source: string;
    sourceUrl: string;
    boundarySource: string;
    processingNote: string;
    dataQuality: "observed";
  };
}

export function formatPopulation(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "ไม่มีข้อมูล";
  return Math.round(value).toLocaleString("th-TH");
}

export function formatPopulationPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "ไม่มีข้อมูล";
  return `${value > 0 ? "+" : ""}${value.toLocaleString("th-TH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

export function populationMetricValue(row: PopulationRow, metric: PopulationMetric): number | null {
  return row[metric];
}

export function populationColor(value: number | null, min: number, max: number, metric: PopulationMetric): string {
  if (value === null || !Number.isFinite(value)) return "#334155";
  if (metric === "change_pct") {
    if (value <= -2) return "#b91c1c";
    if (value < 0) return "#f97316";
    if (value < 1) return "#facc15";
    if (value < 2) return "#34d399";
    return "#059669";
  }
  const ratio = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0.5;
  if (ratio >= 0.8) return "#312e81";
  if (ratio >= 0.6) return "#4338ca";
  if (ratio >= 0.4) return "#6366f1";
  if (ratio >= 0.2) return "#818cf8";
  return "#c7d2fe";
}
