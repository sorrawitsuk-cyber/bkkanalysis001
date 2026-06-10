export type DecisionMode = "flood" | "heat";

export interface ScoreComponent {
  key: string;
  label: string;
  value: number | null;
  normalized: number | null;
  weight: number;
  source: string;
  unit: string;
  status: "observed" | "derived" | "unavailable";
  observationCount?: number | null;
}

export interface DecisionScore {
  score: number | null;
  level: "สูงมาก" | "สูง" | "ปานกลาง" | "ต่ำ" | "ข้อมูลไม่พอ" | "ไม่มีข้อมูล";
  confidence: "สูง" | "ปานกลาง" | "ต่ำ";
  coverage: number;
  components: ScoreComponent[];
}

export function minMaxNormalize(
  value: number | null,
  values: Array<number | null>,
  inverse = false,
): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const valid = values.filter((item): item is number => item !== null && Number.isFinite(item));
  if (valid.length < 2) return null;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  if (max === min) return 50;
  const normalized = ((value - min) / (max - min)) * 100;
  return inverse ? 100 - normalized : normalized;
}

export function combineComponents(
  components: ScoreComponent[],
  expectedSourceCount: number,
  minimumCoverage = 0.55,
): DecisionScore {
  const available = components.filter((component) => component.normalized !== null);
  const availableWeight = available.reduce((sum, component) => sum + component.weight, 0);
  const rawScore = availableWeight > 0
    ? available.reduce(
        (sum, component) => sum + (component.normalized ?? 0) * component.weight,
        0,
      ) / availableWeight
    : null;
  const coverage = expectedSourceCount > 0
    ? Math.min(1, available.length / expectedSourceCount)
    : 0;
  const score = coverage >= minimumCoverage ? rawScore : null;

  return {
    score: score === null ? null : Math.round(score * 10) / 10,
    level: rawScore === null
      ? "ไม่มีข้อมูล"
      : coverage < minimumCoverage
        ? "ข้อมูลไม่พอ"
      : rawScore >= 80
        ? "สูงมาก"
        : rawScore >= 60
          ? "สูง"
          : rawScore >= 40
            ? "ปานกลาง"
            : "ต่ำ",
    confidence: coverage >= 0.8 ? "สูง" : coverage >= 0.55 ? "ปานกลาง" : "ต่ำ",
    coverage: Math.round(coverage * 100),
    components,
  };
}
