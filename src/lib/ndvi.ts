import type { DistrictStatistic, NdviClass } from "@/types/district";

const NDVI_CLASS_THAI: Record<NdviClass, string> = {
  "Very Low": "เขียวน้อยมาก",
  Low: "เขียวน้อย",
  Moderate: "ปานกลาง",
  Good: "ดี",
  "Very Good": "ดีมาก",
  Unknown: "ไม่มีข้อมูล",
};

const NDVI_CLASS_COLORS: Record<NdviClass, string> = {
  "Very Low": "#8c2d04",
  Low: "#d94801",
  Moderate: "#f6e05e",
  Good: "#68d391",
  "Very Good": "#238b45",
  Unknown: "#9ca3af",
};

function toNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizeNdviScore(ndviMean: number | null | undefined): number | null {
  const ndvi = toNumber(ndviMean);
  if (ndvi === null) return null;
  const score = ((ndvi - 0.10) / (0.60 - 0.10)) * 10;
  return Math.round(Math.max(0, Math.min(10, score)) * 100) / 100;
}

export function resolveNdviMean(stat: Partial<DistrictStatistic> | null | undefined): number | null {
  if (!stat) return null;
  const ndviMean = toNumber(stat.ndvi_mean);
  if (ndviMean !== null) return ndviMean;
  const legacyNdvi = toNumber(stat.ndvi ?? stat.vegetation_index);
  if (legacyNdvi !== null) return legacyNdvi;
  const score = toNumber(stat.ndvi_score);
  if (score !== null) return score / 10;
  return null;
}

export function getNdviClass(ndviMean: number | null | undefined): NdviClass {
  const ndvi = toNumber(ndviMean);
  if (ndvi === null) return "Unknown";
  if (ndvi < 0.15) return "Very Low";
  if (ndvi < 0.25) return "Low";
  if (ndvi < 0.35) return "Moderate";
  if (ndvi < 0.50) return "Good";
  return "Very Good";
}

export function getNdviClassThai(className: NdviClass | string | null | undefined): string {
  const safeClass = (className || "Unknown") as NdviClass;
  return NDVI_CLASS_THAI[safeClass] || NDVI_CLASS_THAI.Unknown;
}

export function getNdviColor(value: number | null | undefined): string {
  return NDVI_CLASS_COLORS[getNdviClass(value)];
}

export function formatPercent(value: number | null | undefined): string {
  const num = toNumber(value);
  if (num === null) return "ไม่มีข้อมูล";
  return `${(num * 100).toFixed(1)}%`;
}

export function formatRai(value: number | null | undefined): string {
  const num = toNumber(value);
  if (num === null) return "ไม่มีข้อมูล";
  return `${num.toLocaleString("th-TH", { maximumFractionDigits: 0 })} ไร่`;
}

export function calculatePriorityScore(stat: DistrictStatistic): number {
  const lowGreenRatio = toNumber(stat.low_green_ratio) ?? Math.max(0, 1 - ((stat.green_area_ratio ?? 0) * 2));
  const ndviMean = resolveNdviMean(stat);
  const ndviScore = stat.ndvi_score ?? normalizeNdviScore(ndviMean) ?? 0;
  const ndviDeclineScore = Math.max(0, Math.min(1, (10 - ndviScore) / 10));
  const densityScore = Math.max(0, Math.min(1, (stat.density ?? 0) / 20000));
  const ntlScore = Math.max(0, Math.min(1, (stat.ntl_mean ?? 0) / 60));
  const priority = (lowGreenRatio * 0.4) + (ndviDeclineScore * 0.3) + (densityScore * 0.2) + (ntlScore * 0.1);
  return Math.round(priority * 1000) / 10;
}

export function getNdviRecommendation(stat: DistrictStatistic): string[] {
  const ndviMean = resolveNdviMean(stat);
  const recommendations: string[] = [];

  if (ndviMean === null) {
    return ["ยังไม่มีข้อมูล NDVI เพียงพอ ควรตรวจสอบ pipeline และข้อมูลดาวเทียมของเขตนี้"];
  }

  if (ndviMean < 0.25) {
    recommendations.push("ควรพิจารณาเพิ่มพื้นที่สีเขียวขนาดเล็ก เช่น pocket park หรือสวนหย่อมชุมชน");
    recommendations.push("ควรเพิ่มแนวต้นไม้ริมถนนและพื้นที่ร่มเงาในจุดเมืองหนาแน่น");
  }

  if ((stat.green_area_ratio ?? 1) < 0.15) {
    recommendations.push("ควรจัดลำดับพื้นที่นี้เป็นเขตเป้าหมายสำหรับเพิ่มพื้นที่สีเขียว");
  }

  if ((stat.low_green_ratio ?? 0) > 0.55) {
    recommendations.push("ควรสำรวจพื้นที่ว่างของรัฐหรือเอกชนที่สามารถใช้เป็นพื้นที่สีเขียวชั่วคราวได้");
  }

  if ((stat.ntl_mean ?? 0) > 35 && ndviMean < 0.35) {
    recommendations.push("พื้นที่มีกิจกรรมเมืองสูงจากค่าแสงกลางคืน ควรเพิ่มร่มเงาและทางเดินสีเขียวในย่านใช้งานหนาแน่น");
  }

  return recommendations.length
    ? recommendations
    : ["รักษาพื้นที่สีเขียวเดิมและติดตามแนวโน้ม NDVI รายปีเพื่อป้องกันการลดลงของพืชพรรณ"];
}

export function getPriorityReasons(stat: DistrictStatistic): string[] {
  const reasons: string[] = [];
  const ndviMean = resolveNdviMean(stat);
  if (ndviMean !== null && ndviMean < 0.25) reasons.push("NDVI ต่ำ");
  if ((stat.green_area_ratio ?? 1) < 0.15 || (stat.low_green_ratio ?? 0) > 0.5) reasons.push("พื้นที่สีเขียวน้อย");
  if ((stat.ntl_mean ?? 0) > 35) reasons.push("ความเข้มข้นกิจกรรมเมืองสูง");
  return reasons.length ? reasons : ["ควรติดตามต่อเนื่อง"];
}
