export type DataQuality = "observed" | "modeled" | "estimated" | "fallback" | "unavailable" | "unknown";

export interface DataProvenance {
  quality: DataQuality;
  source: string;
  sourceLabel?: string | null;
  sourceNote?: string | null;
  period?: string | null;
  generatedAt?: string | null;
  methodologyId?: string | null;
  qualityFlags?: string[];
}

type ProvenanceSummary = {
  source?: string | null;
  sourceLabel?: string | null;
  sourceNote?: string | null;
  dataSource?: string | null;
  dataQuality?: string | null;
  note?: string | null;
  periodLabel?: string | null;
  generatedAt?: string | null;
  generated_at?: string | null;
  methodologyId?: string | null;
};

const QUALITY_LABELS: Record<DataQuality, string> = {
  observed: "Observed",
  modeled: "Modeled",
  estimated: "Estimated",
  fallback: "Fallback",
  unavailable: "Unavailable",
  unknown: "Unknown",
};

export function normalizeDataQuality(value: unknown): DataQuality {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("observed") || normalized.includes("ข้อมูลสังเกต")) return "observed";
  if (normalized.includes("modeled") || normalized.includes("modelled") || normalized.includes("จำลอง")) return "modeled";
  if (normalized.includes("estimated") || normalized.includes("estimate") || normalized.includes("ประมาณ")) return "estimated";
  if (normalized.includes("fallback") || normalized.includes("demo") || normalized.includes("mock")) return "fallback";
  if (normalized.includes("unavailable") || normalized.includes("ไม่มีข้อมูล")) return "unavailable";
  return "unknown";
}

export function buildProvenance(options: {
  summary?: ProvenanceSummary | null;
  source?: string | null;
  period?: string | null;
  methodologyId?: string | null;
  fallbackQuality?: DataQuality;
  qualityFlags?: Array<string | null | undefined | false>;
}): DataProvenance {
  const summary = options.summary ?? {};
  const source = options.source ?? summary.sourceLabel ?? summary.dataSource ?? summary.source ?? "ไม่ระบุแหล่งข้อมูล";
  const quality = normalizeDataQuality(summary.dataQuality ?? options.fallbackQuality ?? source);
  return {
    quality,
    source,
    sourceLabel: summary.sourceLabel ?? null,
    sourceNote: summary.sourceNote ?? summary.note ?? null,
    period: options.period ?? summary.periodLabel ?? null,
    generatedAt: summary.generatedAt ?? summary.generated_at ?? null,
    methodologyId: options.methodologyId ?? summary.methodologyId ?? null,
    qualityFlags: options.qualityFlags?.filter((flag): flag is string => Boolean(flag)) ?? [],
  };
}

export function getQualityLabel(quality: DataQuality) {
  return QUALITY_LABELS[quality] ?? QUALITY_LABELS.unknown;
}

export function getPolicySafeInsight(options: {
  selected: boolean;
  title: string;
  metricLabel: string;
  primaryValue?: number | null;
  averageValue?: number | null;
  higherIsConcern?: boolean;
  provenance: DataProvenance;
}) {
  if (!options.selected) {
    return "เลือกพื้นที่บนแผนที่เพื่อดูบริบทของตัวเลข แหล่งข้อมูล และข้อควรระวังก่อนนำไปใช้ต่อ";
  }

  const { primaryValue, averageValue, higherIsConcern = true } = options;
  const hasComparison = typeof primaryValue === "number" && typeof averageValue === "number" && Number.isFinite(averageValue);
  const direction = hasComparison
    ? primaryValue > averageValue
      ? "สูงกว่าค่าเฉลี่ยของชุดข้อมูลนี้"
      : primaryValue < averageValue
        ? "ต่ำกว่าค่าเฉลี่ยของชุดข้อมูลนี้"
        : "ใกล้เคียงค่าเฉลี่ยของชุดข้อมูลนี้"
    : "ควรอ่านร่วมกับค่าเฉลี่ยและแนวโน้มย้อนหลัง";

  const concern = hasComparison && primaryValue !== averageValue
    ? (higherIsConcern === primaryValue > averageValue ? "เป็นสัญญาณที่ควรตรวจสอบเพิ่มเติม" : "ยังไม่ใช่สัญญาณเสี่ยงหลักจากตัวชี้วัดนี้")
    : "ยังไม่ควรสรุปเชิงนโยบายจากตัวเลขเดียว";

  const caveat = options.provenance.quality === "observed"
    ? "ข้อมูลเป็นข้อมูลสังเกตหรือสรุปจากแหล่งที่ระบุ แต่ยังควรตรวจบริบทพื้นที่จริง"
    : "ข้อมูลมีข้อจำกัดด้านคุณภาพหรือวิธีประมาณค่า จึงควรใช้เป็นสัญญาณเบื้องต้น";

  return `${options.title}: ${options.metricLabel} ${direction} และ${concern}. ${caveat}`;
}
