export const LAND_COVER_MIN_YEAR = 2016;

export type LandCoverLayer = "change" | "current" | "baseline";

export interface LandCoverDistrictRow {
  district_id: number;
  district_name: string;
  green_pct: number | null;
  built_pct: number | null;
  water_pct: number | null;
  bare_pct: number | null;
  baseline_green_pct: number | null;
  baseline_built_pct: number | null;
  green_change_pp: number | null;
  built_change_pp: number | null;
  green_to_built_pct: number | null;
  built_to_green_pct: number | null;
  changed_pct: number | null;
  confidence_pct: number | null;
  coverage_pct: number | null;
}

export interface LandCoverResponse {
  period: {
    year: number;
    baselineYear: number;
    currentLabel: string;
    baselineLabel: string;
    currentEnd: string;
    baselineEnd: string;
  };
  rows: LandCoverDistrictRow[];
  geojson: {
    type: "FeatureCollection";
    features: Array<Record<string, unknown>>;
  };
  summary: {
    greenPct: number | null;
    builtPct: number | null;
    waterPct: number | null;
    barePct: number | null;
    greenChangePp: number | null;
    builtChangePp: number | null;
    greenToBuiltPct: number | null;
    builtToGreenPct: number | null;
    changedPct: number | null;
    averageConfidencePct: number | null;
    averageCoveragePct: number | null;
    highestConversionDistrict: string | null;
    highestGreenGainDistrict: string | null;
    currentSceneCount: number;
    baselineSceneCount: number;
    source: string;
    dataQuality: "modeled" | "unavailable";
    processingNote: string;
  };
  rasters: {
    change: { urlFormat: string | null; palette: string[]; labels: string[] };
    current: { urlFormat: string | null; palette: string[]; labels: string[] };
    baseline: { urlFormat: string | null; palette: string[]; labels: string[] };
  };
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "ไม่มีข้อมูล";
  return `${value.toLocaleString("th-TH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

export function formatPercentagePoint(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "ไม่มีข้อมูล";
  return `${value > 0 ? "+" : ""}${value.toLocaleString("th-TH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} จุด%`;
}

export function conversionColor(value: number | null, max: number): string {
  if (value === null || !Number.isFinite(value)) return "#334155";
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  if (ratio >= 0.8) return "#7f1d1d";
  if (ratio >= 0.6) return "#dc2626";
  if (ratio >= 0.4) return "#f97316";
  if (ratio >= 0.2) return "#facc15";
  return "#22c55e";
}
