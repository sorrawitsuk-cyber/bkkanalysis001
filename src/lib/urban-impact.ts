export interface ImpactComponent {
  key: "rainfall" | "water_signal" | "flood_reports" | "population" | "density";
  label: string;
  rawValue: number | null;
  normalized: number | null;
  unit: string;
  weight: number;
}

export interface UrbanImpactRow {
  district: string;
  score: number | null;
  level: "สูงมาก" | "สูง" | "ปานกลาง" | "ต่ำ" | "ข้อมูลไม่พอ";
  coveragePct: number;
  rainfallMm: number | null;
  waterSignalPct: number | null;
  floodReports: number | null;
  unresolvedReports: number | null;
  population: number | null;
  density: number | null;
  components: ImpactComponent[];
}

function normalizedValue(
  value: number | null | undefined,
  values: Array<number | null | undefined>,
): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const valid = values.filter(
    (item): item is number => item !== null && item !== undefined && Number.isFinite(item),
  );
  if (valid.length < 2) return null;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  if (min === max) return 50;
  return ((value - min) / (max - min)) * 100;
}

function levelFromScore(score: number | null): UrbanImpactRow["level"] {
  if (score === null) return "ข้อมูลไม่พอ";
  if (score >= 75) return "สูงมาก";
  if (score >= 55) return "สูง";
  if (score >= 35) return "ปานกลาง";
  return "ต่ำ";
}

export function buildUrbanImpactRows(input: {
  districts: string[];
  rainfallByDistrict?: Map<string, number | null>;
  waterSignalByDistrict?: Map<string, number | null>;
  floodReportsByDistrict?: Map<string, { recent: number; unresolved: number }>;
  populationByDistrict?: Map<string, { population: number; density: number }>;
}): UrbanImpactRow[] {
  const rawRows = input.districts.map((district) => ({
    district,
    rainfall: input.rainfallByDistrict?.get(district) ?? null,
    water_signal: input.waterSignalByDistrict?.get(district) ?? null,
    flood_reports: input.floodReportsByDistrict?.get(district)?.recent ?? null,
    population: input.populationByDistrict?.get(district)?.population ?? null,
    density: input.populationByDistrict?.get(district)?.density ?? null,
  }));

  const valuesByKey = {
    rainfall: rawRows.map((row) => row.rainfall),
    water_signal: rawRows.map((row) => row.water_signal),
    flood_reports: rawRows.map((row) => row.flood_reports),
    population: rawRows.map((row) => row.population),
    density: rawRows.map((row) => row.density),
  };
  const weights: Record<ImpactComponent["key"], number> = {
    rainfall: 0.25,
    water_signal: 0.25,
    flood_reports: 0.2,
    population: 0.15,
    density: 0.15,
  };
  const labels: Record<ImpactComponent["key"], { label: string; unit: string }> = {
    rainfall: { label: "ฝนสะสม", unit: "มม." },
    water_signal: { label: "สัญญาณน้ำจากดาวเทียม", unit: "%" },
    flood_reports: { label: "เรื่องร้องเรียนน้ำท่วม", unit: "เรื่อง" },
    population: { label: "ประชากร", unit: "คน" },
    density: { label: "ความหนาแน่น", unit: "คน/ตร.กม." },
  };
  const activeKeys = (Object.keys(weights) as ImpactComponent["key"][]).filter((key) => {
    if (key === "rainfall") return input.rainfallByDistrict !== undefined;
    if (key === "water_signal") return input.waterSignalByDistrict !== undefined;
    if (key === "flood_reports") return input.floodReportsByDistrict !== undefined;
    return input.populationByDistrict !== undefined;
  });

  return rawRows
    .map((row) => {
      const rawValues: Record<ImpactComponent["key"], number | null> = {
        rainfall: row.rainfall,
        water_signal: row.water_signal,
        flood_reports: row.flood_reports,
        population: row.population,
        density: row.density,
      };
      const components = activeKeys.map((key) => ({
        key,
        label: labels[key].label,
        rawValue: rawValues[key],
        normalized: normalizedValue(
          rawValues[key],
          valuesByKey[key],
        ),
        unit: labels[key].unit,
        weight: weights[key],
      }));
      const available = components.filter((component) => component.normalized !== null);
      const availableWeight = available.reduce((sum, component) => sum + component.weight, 0);
      const coveragePct = Math.round((available.length / components.length) * 100);
      const score = coveragePct >= 60 && availableWeight > 0
        ? available.reduce(
            (sum, component) => sum + (component.normalized ?? 0) * component.weight,
            0,
          ) / availableWeight
        : null;

      return {
        district: row.district,
        score: score === null ? null : Math.round(score * 10) / 10,
        level: levelFromScore(score),
        coveragePct,
        rainfallMm: row.rainfall,
        waterSignalPct: row.water_signal,
        floodReports: row.flood_reports,
        unresolvedReports: input.floodReportsByDistrict?.get(row.district)?.unresolved ?? null,
        population: row.population,
        density: row.density,
        components,
      };
    })
    .sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
}

export function normalizePopulationExposure<T extends {
  population: number;
  density: number;
  houses: number;
  change_pct: number | null;
}>(rows: T[]) {
  const populationExposureLevel = (score: number): "สูงมาก" | "สูง" | "ปานกลาง" | "ต่ำ" => {
    if (score >= 75) return "สูงมาก";
    if (score >= 55) return "สูง";
    if (score >= 35) return "ปานกลาง";
    return "ต่ำ";
  };
  const populationValues = rows.map((row) => row.population);
  const densityValues = rows.map((row) => row.density);
  const housesValues = rows.map((row) => row.houses);
  const growthValues = rows.map((row) => Math.max(0, row.change_pct ?? 0));

  const scored = rows.map((row) => {
    const components = {
      population: normalizedValue(row.population, populationValues) ?? 0,
      density: normalizedValue(row.density, densityValues) ?? 0,
      houses: normalizedValue(row.houses, housesValues) ?? 0,
      growth: normalizedValue(Math.max(0, row.change_pct ?? 0), growthValues) ?? 0,
    };
    const exposureScore =
      components.population * 0.35 +
      components.density * 0.35 +
      components.houses * 0.2 +
      components.growth * 0.1;
    return {
      ...row,
      exposure_score: Math.round(exposureScore * 10) / 10,
      exposure_components: components,
    };
  });

  const ranked = [...scored].sort((a, b) => b.exposure_score - a.exposure_score);
  const rankByScore = new Map(ranked.map((row, index) => [row.exposure_score, index + 1]));
  return scored.map((row) => ({
    ...row,
    exposure_rank: rankByScore.get(row.exposure_score) ?? ranked.length,
    exposure_level: populationExposureLevel(row.exposure_score),
  }));
}
