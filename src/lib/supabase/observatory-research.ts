import "server-only";

import { createClient } from "@supabase/supabase-js";

export type ObservatoryResearchPreview = {
  status: "available";
  reportPath: string;
  processingRunId: string;
  resultChecksumSha256: string;
  sourceManifestChecksumSha256: string;
  boundaryResultChecksumSha256: string;
  analysisYears: number[];
  seasons: Array<"hot" | "wet" | "cool">;
  districtCount: number;
  statisticRowCount: number;
};

export type ResearchSeason = "hot" | "wet" | "cool";

type ResearchObservationRow = {
  area_code: string;
  analysis_year: number;
  season_id: ResearchSeason;
  statistic: "median" | "p10" | "p90" | "interquartile-range";
  value: number;
  unit: string;
  valid_coverage: number;
  scene_count: number;
  valid_observation_count: number;
  quality_status: "accepted" | "rejected";
  source_manifest_checksum_sha256: string;
  boundary_result_checksum_sha256: string;
};

type ResearchAreaRow = {
  area_code: string;
  area_square_meters: number;
  source_survey_year_buddhist: number;
};

type DistrictStatistics = {
  median?: ResearchObservationRow;
  p10?: ResearchObservationRow;
  p90?: ResearchObservationRow;
  interquartileRange?: ResearchObservationRow;
};

export type ResearchObservationPayload = {
  observations: Array<{
    areaCode: string;
    statistic: "median";
    value: number;
    baselineValue: number;
    delta: number;
    p10: number;
    p90: number;
    interquartileRange: number;
    unit: string;
    coverage: number;
    baselineCoverage: number;
    sceneCount: number;
    baselineSceneCount: number;
    validObservationCount: number;
  }>;
  summary: {
    averageValue: number;
    averageBaselineValue: number;
    averageDelta: number;
    observationCount: number;
    minCoverage: number;
    minBaselineCoverage: number;
  };
  boundarySurveyYearsBuddhist: number[];
};

const REQUEST_TIMEOUT_MS = 8_000;

export async function getResearchDistrictObservations(options: {
  preview: ObservatoryResearchPreview;
  productId: string;
  year: number;
  baseline: number;
  season: ResearchSeason;
}): Promise<ResearchObservationPayload> {
  const {
    preview,
    productId,
    year,
    baseline,
    season,
  } = options;

  if (
    !preview.analysisYears.includes(year)
    || !preview.analysisYears.includes(baseline)
    || !preview.seasons.includes(season)
    || baseline >= year
  ) {
    throw new Error("requested research period is not registered");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (
    !supabaseUrl
    || !serviceRoleKey
    || serviceRoleKey === anonKey
  ) {
    throw new Error("research observation service is not configured");
  }

  const timedFetch: typeof fetch = async (input, init) => {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS,
    );
    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  };
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: { fetch: timedFetch },
  });

  const [observationResult, areaResult] = await Promise.all([
    supabase
      .from("observatory_research_observations")
      .select(
        "area_code,analysis_year,season_id,statistic,value,unit,"
        + "valid_coverage,scene_count,valid_observation_count,"
        + "quality_status,source_manifest_checksum_sha256,"
        + "boundary_result_checksum_sha256",
      )
      .eq("processing_run_id", preview.processingRunId)
      .eq("product_id", productId)
      .eq("season_id", season)
      .in("analysis_year", [baseline, year])
      .order("area_code"),
    supabase
      .from("observatory_research_areas")
      .select(
        "area_code,area_square_meters,source_survey_year_buddhist",
      )
      .eq(
        "boundary_result_checksum_sha256",
        preview.boundaryResultChecksumSha256,
      )
      .order("area_code"),
  ]);

  if (observationResult.error) {
    throw new Error(
      `research observations: ${observationResult.error.message}`,
    );
  }
  if (areaResult.error) {
    throw new Error(`research areas: ${areaResult.error.message}`);
  }

  const rows =
    observationResult.data as unknown as ResearchObservationRow[];
  const areas = areaResult.data as unknown as ResearchAreaRow[];
  const expectedRowCount = preview.districtCount * 2 * 4;
  if (
    rows.length !== expectedRowCount
    || areas.length !== preview.districtCount
  ) {
    throw new Error("research observation matrix is incomplete");
  }
  if (
    rows.some(
      (row) =>
        row.quality_status !== "accepted"
        || row.source_manifest_checksum_sha256
          !== preview.sourceManifestChecksumSha256
        || row.boundary_result_checksum_sha256
          !== preview.boundaryResultChecksumSha256,
    )
  ) {
    throw new Error("research observation provenance does not match");
  }

  const grouped = new Map<
    string,
    { current: DistrictStatistics; baseline: DistrictStatistics }
  >();
  for (const row of rows) {
    const district = grouped.get(row.area_code) ?? {
      current: {},
      baseline: {},
    };
    const target =
      row.analysis_year === year ? district.current : district.baseline;
    const key =
      row.statistic === "interquartile-range"
        ? "interquartileRange"
        : row.statistic;
    target[key] = row;
    grouped.set(row.area_code, district);
  }

  const areaByCode = new Map(
    areas.map((area) => [area.area_code, area]),
  );
  const observations = [...grouped.entries()].map(
    ([areaCode, district]) => {
      const current = district.current;
      const baselineStats = district.baseline;
      const area = areaByCode.get(areaCode);
      if (
        !area
        || !current.median
        || !current.p10
        || !current.p90
        || !current.interquartileRange
        || !baselineStats.median
      ) {
        throw new Error(
          `research observation statistics are incomplete for ${areaCode}`,
        );
      }
      return {
        areaCode,
        statistic: "median" as const,
        value: current.median.value,
        baselineValue: baselineStats.median.value,
        delta: round(
          current.median.value - baselineStats.median.value,
        ),
        p10: current.p10.value,
        p90: current.p90.value,
        interquartileRange: current.interquartileRange.value,
        unit: current.median.unit,
        coverage: current.median.valid_coverage,
        baselineCoverage: baselineStats.median.valid_coverage,
        sceneCount: current.median.scene_count,
        baselineSceneCount: baselineStats.median.scene_count,
        validObservationCount:
          current.median.valid_observation_count,
        areaSquareMeters: area.area_square_meters,
      };
    },
  );

  if (observations.length !== preview.districtCount) {
    throw new Error("research observation district count does not match");
  }

  const totalArea = observations.reduce(
    (sum, observation) => sum + observation.areaSquareMeters,
    0,
  );
  const weightedCurrent = observations.reduce(
    (sum, observation) =>
      sum + observation.value * observation.areaSquareMeters,
    0,
  ) / totalArea;
  const weightedBaseline = observations.reduce(
    (sum, observation) =>
      sum
      + observation.baselineValue * observation.areaSquareMeters,
    0,
  ) / totalArea;

  return {
    observations: observations.map((observation) => ({
      areaCode: observation.areaCode,
      statistic: observation.statistic,
      value: observation.value,
      baselineValue: observation.baselineValue,
      delta: observation.delta,
      p10: observation.p10,
      p90: observation.p90,
      interquartileRange: observation.interquartileRange,
      unit: observation.unit,
      coverage: observation.coverage,
      baselineCoverage: observation.baselineCoverage,
      sceneCount: observation.sceneCount,
      baselineSceneCount: observation.baselineSceneCount,
      validObservationCount: observation.validObservationCount,
    })),
    summary: {
      averageValue: round(weightedCurrent),
      averageBaselineValue: round(weightedBaseline),
      averageDelta: round(weightedCurrent - weightedBaseline),
      observationCount: observations.length,
      minCoverage: Math.min(
        ...observations.map((observation) => observation.coverage),
      ),
      minBaselineCoverage: Math.min(
        ...observations.map(
          (observation) => observation.baselineCoverage,
        ),
      ),
    },
    boundarySurveyYearsBuddhist: [
      ...new Set(
        areas.map((area) => area.source_survey_year_buddhist),
      ),
    ].sort(),
  };
}

function round(value: number) {
  const factor = 1_000_000;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
