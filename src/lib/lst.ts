export type LSTClass = "low" | "moderate" | "high" | "very_high" | "extreme" | "unknown";

export interface LSTLegendItem {
  className: LSTClass;
  label: string;
  range: string;
  color: string;
}

export function classifyLST(value: number | null | undefined): LSTClass {
  if (value === null || value === undefined || Number.isNaN(value)) return "unknown";
  if (value < 32) return "low";
  if (value < 36) return "moderate";
  if (value < 40) return "high";
  if (value < 44) return "very_high";
  return "extreme";
}

export function getLSTClassThai(value: number | null | undefined): string {
  const labels: Record<LSTClass, string> = {
    low: "ต่ำ",
    moderate: "ปานกลาง",
    high: "สูง",
    very_high: "สูงมาก",
    extreme: "สูงมากเป็นพิเศษ",
    unknown: "ไม่มีข้อมูล",
  };
  return labels[classifyLST(value)];
}

export function getLSTColor(value: number | null | undefined): string {
  const colors: Record<LSTClass, string> = {
    low: "#FFEDA0",
    moderate: "#FED976",
    high: "#FD8D3C",
    very_high: "#E31A1C",
    extreme: "#800026",
    unknown: "#9ca3af",
  };
  return colors[classifyLST(value)];
}

export function formatLST(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "ไม่มีข้อมูล";
  return `${value.toFixed(digits)}°C`;
}

export function getLSTLegendItems(): LSTLegendItem[] {
  return [
    { className: "low", label: "ต่ำ", range: "< 32", color: "#FFEDA0" },
    { className: "moderate", label: "ปานกลาง", range: "32-36", color: "#FED976" },
    { className: "high", label: "สูง", range: "36-40", color: "#FD8D3C" },
    { className: "very_high", label: "สูงมาก", range: "40-44", color: "#E31A1C" },
    { className: "extreme", label: "สูงมากเป็นพิเศษ", range: "> 44", color: "#800026" },
  ];
}
