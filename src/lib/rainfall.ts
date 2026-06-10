export const RAINFALL_WINDOWS = [1, 3, 7, 30] as const;

export type RainfallWindow = (typeof RAINFALL_WINDOWS)[number];

export interface RainfallDistrictRow {
  district_id: number;
  district_name: string;
  rainfall_mm: number | null;
  previous_mm: number | null;
  change_mm: number | null;
  change_pct: number | null;
  daily_average_mm: number | null;
}

export interface RainfallTrendPoint {
  date: string;
  rainfall_mm: number | null;
}

export interface RainfallResponse {
  period: {
    start: string;
    end: string;
    label: string;
    days: RainfallWindow;
    comparisonStart: string;
    comparisonEnd: string;
  };
  rows: RainfallDistrictRow[];
  geojson: {
    type: "FeatureCollection";
    features: Array<Record<string, unknown>>;
  };
  trend: RainfallTrendPoint[];
  summary: {
    bangkokMeanMm: number | null;
    previousMeanMm: number | null;
    changeMm: number | null;
    changePct: number | null;
    maximumDistrictMm: number | null;
    minimumDistrictMm: number | null;
    wettestDistrict: string | null;
    driestDistrict: string | null;
    observationCount: number;
    expectedObservationCount: number;
    completenessPct: number;
    isPartial: boolean;
    latestObservation: string | null;
    approximateResolutionKm: number;
    source: string;
    dataQuality: "observed" | "unavailable";
    processingNote: string;
  };
  raster: {
    urlFormat: string | null;
    min: number;
    max: number;
    palette: string[];
  };
}

export function isRainfallWindow(value: number): value is RainfallWindow {
  return RAINFALL_WINDOWS.includes(value as RainfallWindow);
}

export function formatRainfall(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "ไม่มีข้อมูล";
  return `${value.toLocaleString("th-TH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} มม.`;
}

export function rainfallColor(value: number | null, max: number): string {
  if (value === null || !Number.isFinite(value)) return "#334155";
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  if (ratio >= 0.8) return "#7c2d12";
  if (ratio >= 0.6) return "#ea580c";
  if (ratio >= 0.4) return "#eab308";
  if (ratio >= 0.2) return "#22c55e";
  return "#38bdf8";
}
