export const URBAN_EXPANSION_MIN_YEAR = 2016;

export interface UrbanExpansionDistrictRow {
  district_id: number;
  district_name: string;
  built_cover_pct: number | null;
  built_area_rai: number | null;
  baseline_built_cover_pct: number | null;
  built_change_pp: number | null;
  built_gain_pct: number | null;
  built_loss_pct: number | null;
  stable_built_pct: number | null;
  green_to_built_pct: number | null;
  bare_to_built_pct: number | null;
  built_to_green_pct: number | null;
  confidence_pct: number | null;
  coverage_pct: number | null;
}

export interface UrbanExpansionResponse {
  period: {
    year: number;
    baselineYear: number;
    currentLabel: string;
    baselineLabel: string;
  };
  rows: UrbanExpansionDistrictRow[];
  geojson: {
    type: "FeatureCollection";
    features: Array<Record<string, unknown>>;
  };
  summary: {
    builtCoverPct: number | null;
    builtAreaRai: number | null;
    builtChangePp: number | null;
    builtGainPct: number | null;
    builtLossPct: number | null;
    greenToBuiltPct: number | null;
    bareToBuiltPct: number | null;
    averageConfidencePct: number | null;
    averageCoveragePct: number | null;
    highestBuiltCoverDistrict: string | null;
    highestBuiltGainDistrict: string | null;
    highestGreenConversionDistrict: string | null;
    currentSceneCount: number;
    baselineSceneCount: number;
    source: string;
    dataQuality: "modeled";
    processingNote: string;
  };
  rasters: {
    current: { urlFormat: string | null; palette: string[]; labels: string[] };
    change: { urlFormat: string | null; palette: string[]; labels: string[] };
  };
}

export function formatUrbanPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "ไม่มีข้อมูล";
  return `${value.toLocaleString("th-TH", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

export function formatUrbanChange(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "ไม่มีข้อมูล";
  return `${value > 0 ? "+" : ""}${value.toLocaleString("th-TH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} จุด%`;
}

export function formatUrbanRai(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "ไม่มีข้อมูล";
  return `${Math.round(value).toLocaleString("th-TH")} ไร่`;
}

export function builtCoverColor(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "#334155";
  if (value < 30) return "#fef3c7";
  if (value < 50) return "#fdba74";
  if (value < 70) return "#f97316";
  if (value < 85) return "#dc2626";
  return "#7f1d1d";
}

export function builtChangeColor(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "#334155";
  if (value <= -3) return "#166534";
  if (value < -1) return "#4ade80";
  if (value <= 1) return "#cbd5e1";
  if (value < 3) return "#fb923c";
  return "#b91c1c";
}
