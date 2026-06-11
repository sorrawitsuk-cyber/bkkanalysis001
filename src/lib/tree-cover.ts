export const TREE_COVER_MIN_YEAR = 2016;

export interface TreeCoverDistrictRow {
  district_id: number;
  district_name: string;
  tree_cover_pct: number | null;
  tree_cover_rai: number | null;
  baseline_tree_cover_pct: number | null;
  tree_cover_change_pp: number | null;
  tree_gain_pct: number | null;
  tree_loss_pct: number | null;
  stable_tree_pct: number | null;
  confidence_pct: number | null;
  coverage_pct: number | null;
}

export interface TreeCoverResponse {
  period: {
    year: number;
    baselineYear: number;
    currentLabel: string;
    baselineLabel: string;
  };
  rows: TreeCoverDistrictRow[];
  geojson: {
    type: "FeatureCollection";
    features: Array<Record<string, unknown>>;
  };
  summary: {
    treeCoverPct: number | null;
    treeCoverRai: number | null;
    treeCoverChangePp: number | null;
    treeGainPct: number | null;
    treeLossPct: number | null;
    averageConfidencePct: number | null;
    averageCoveragePct: number | null;
    highestTreeCoverDistrict: string | null;
    lowestTreeCoverDistrict: string | null;
    highestTreeGainDistrict: string | null;
    highestTreeLossDistrict: string | null;
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

export function formatTreePercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "ไม่มีข้อมูล";
  return `${value.toLocaleString("th-TH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

export function formatTreeChange(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "ไม่มีข้อมูล";
  return `${value > 0 ? "+" : ""}${value.toLocaleString("th-TH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} จุด%`;
}

export function formatTreeRai(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "ไม่มีข้อมูล";
  return `${Math.round(value).toLocaleString("th-TH")} ไร่`;
}

export function treeCoverColor(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "#334155";
  if (value < 5) return "#713f12";
  if (value < 10) return "#a16207";
  if (value < 20) return "#65a30d";
  if (value < 30) return "#16a34a";
  return "#047857";
}

export function treeChangeColor(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "#334155";
  if (value <= -3) return "#b91c1c";
  if (value < -1) return "#f97316";
  if (value <= 1) return "#cbd5e1";
  if (value < 3) return "#4ade80";
  return "#047857";
}
