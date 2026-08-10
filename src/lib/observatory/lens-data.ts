import type { ObservatoryLens } from "@/lib/observatory/catalog";

type ApiFeature = {
  type: "Feature";
  geometry: GeoJSON.Geometry;
  properties: Record<string, unknown> & {
    id?: number;
    name_th?: string;
    name_en?: string;
    delta?: number | null;
  };
};

export type ObservatoryDistrictPayload = {
  geojson?: {
    type: "FeatureCollection";
    features: ApiFeature[];
  };
  summary?: {
    averageValue?: number | null;
    baselineAverageValue?: number | null;
    valueDelta?: number | null;
    avgDelta?: number | null;
    maxValue?: number | null;
    minValue?: number | null;
    validDistrictCount?: number;
    totalDistrictCount?: number;
    coverageRatio?: number | null;
    dataOrigin?: string;
    dataSource?: string;
    dataQuality?: string;
    unavailableReason?: string | null;
    observationStart?: string;
    observationEnd?: string;
    resolutionMeters?: number | null;
    aggregationScaleMeters?: number | null;
    sceneCount?: number | null;
  };
  error?: string;
};

type UnknownPayload = {
  geojson?: {
    type?: unknown;
    features?: unknown;
  };
  summary?: Record<string, unknown>;
  error?: unknown;
};

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const number = finiteNumber(value);
    if (number !== null) return number;
  }
  return null;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function getLensYears(lens: ObservatoryLens, currentYear = new Date().getFullYear()) {
  const maxYear = Math.min(lens.maxYear ?? currentYear, currentYear);
  return Array.from(
    { length: Math.max(0, maxYear - lens.minYear + 1) },
    (_, index) => maxYear - index,
  );
}

export function clampLensYear(lens: ObservatoryLens, year: number, currentYear = new Date().getFullYear()) {
  const years = getLensYears(lens, currentYear);
  if (!years.length) return year;
  const minimumComparableYear = Math.min(years[0], lens.minYear + 1);
  return Math.max(minimumComparableYear, Math.min(years[0], year));
}

export function clampLensBaseline(lens: ObservatoryLens, year: number, baseline: number) {
  const minimum = lens.minYear;
  const maximum = Math.max(minimum, year - 1);
  return Math.max(minimum, Math.min(maximum, baseline));
}

export function buildLensDataRequest(lens: ObservatoryLens, year: number, baseline: number) {
  const endpoint = lens.apiEndpoint ?? "district-metrics";
  const params = new URLSearchParams();

  if (endpoint === "district-metrics") {
    params.set("metric", lens.apiMetric ?? "lst");
    params.set("year", String(year));
    params.set("compareYear", String(baseline));
  } else if (endpoint === "flood-risk") {
    params.set("year", String(year));
    params.set("compareYear", String(baseline));
    params.set("layer", lens.valueKey === "mndwi_mean" ? "mndwi_mean" : "ndwi_mean");
  } else if (endpoint === "population") {
    params.set("year", String(year));
    params.set("compareYear", String(baseline));
    params.set("level", "district");
  } else if (endpoint === "tree-cover") {
    params.set("year", String(year));
    params.set("baseline", String(baseline));
  } else {
    params.set("product", "annual");
    params.set("year", String(year));
    params.set("compareYear", String(baseline));
  }

  return `/api/${endpoint}?${params.toString()}`;
}

export function normalizeLensDataPayload(
  rawValue: unknown,
  lens: ObservatoryLens,
  year: number,
): ObservatoryDistrictPayload {
  const raw = (rawValue ?? {}) as UnknownPayload;
  const rawSummary = raw.summary ?? {};
  const rawFeatures = Array.isArray(raw.geojson?.features)
    ? raw.geojson.features as ApiFeature[]
    : [];
  const deltaKey = lens.deltaKey ?? "delta";
  const valueKey = lens.valueKey ?? "";

  const features: ApiFeature[] = rawFeatures.map((feature): ApiFeature => {
    const properties = feature?.properties ?? {};
    return {
      ...feature,
      properties: {
        ...properties,
        delta: finiteNumber(properties[deltaKey]),
      },
    };
  });

  const values = features
    .map((feature) => finiteNumber(feature.properties[valueKey]))
    .filter((value): value is number => value !== null);
  const deltas = features
    .map((feature) => finiteNumber(feature.properties.delta))
    .filter((value): value is number => value !== null);
  const baselineValues = features
    .map((feature) => {
      const value = finiteNumber(feature.properties[valueKey]);
      const delta = finiteNumber(feature.properties.delta);
      return value !== null && delta !== null ? value - delta : null;
    })
    .filter((value): value is number => value !== null);

  const endpoint = lens.apiEndpoint ?? "district-metrics";
  const dataOrigin = firstString(rawSummary.dataOrigin) ?? (
    endpoint === "population"
      ? "administrative-file"
      : endpoint === "nighttime-lights" || endpoint === "flood-risk" || endpoint === "tree-cover"
        ? "gee-live"
        : undefined
  );
  const averageValue = firstNumber(
    rawSummary.averageValue,
    rawSummary.avgDisplayValue,
    rawSummary.averageRadiance,
    rawSummary.treeCoverPct,
    average(values),
  );
  const averageDelta = firstNumber(
    rawSummary.valueDelta,
    rawSummary.avgDelta,
    rawSummary.treeCoverChangePp,
    average(deltas),
  );
  const validDistrictCount = values.length;
  const totalDistrictCount = features.length || 50;

  return {
    geojson: features.length
      ? { type: "FeatureCollection", features }
      : undefined,
    summary: {
      averageValue,
      baselineAverageValue: firstNumber(
        rawSummary.baselineAverageValue,
        rawSummary.baselineAvg,
        average(baselineValues),
        averageValue !== null && averageDelta !== null ? averageValue - averageDelta : null,
      ),
      valueDelta: averageDelta,
      avgDelta: averageDelta,
      maxValue: firstNumber(
        rawSummary.maxValue,
        rawSummary.max_value,
        rawSummary.maxRadiance,
        values.length ? Math.max(...values) : null,
      ),
      minValue: firstNumber(
        rawSummary.minValue,
        rawSummary.min_value,
        rawSummary.minRadiance,
        values.length ? Math.min(...values) : null,
      ),
      validDistrictCount,
      totalDistrictCount,
      coverageRatio: totalDistrictCount > 0 ? validDistrictCount / totalDistrictCount : null,
      dataOrigin,
      dataSource: firstString(
        rawSummary.dataSource,
        rawSummary.source,
        rawSummary.sourceLabel,
      ),
      dataQuality: endpoint === "tree-cover"
        ? `research-${firstString(rawSummary.dataQuality) ?? "model-derived"}`
        : firstString(rawSummary.dataQuality),
      unavailableReason: firstString(rawSummary.unavailableReason, raw.error),
      observationStart: firstString(rawSummary.observationStart) ?? `${year}-01-01`,
      observationEnd: firstString(rawSummary.observationEnd) ?? `${year}-12-31`,
      resolutionMeters: firstNumber(rawSummary.resolutionMeters),
      aggregationScaleMeters: firstNumber(rawSummary.aggregationScaleMeters),
      sceneCount: firstNumber(rawSummary.sceneCount, rawSummary.observationCount, rawSummary.currentSceneCount),
    },
    error: typeof raw.error === "string" ? raw.error : undefined,
  };
}
