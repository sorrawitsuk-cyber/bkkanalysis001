import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ee from "@google/earthengine";
import dotenv from "dotenv";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RECIPE_PATH = resolve(
  ROOT,
  "config/observatory/recipes/ndvi-seasonal-v1.0.0.json",
);
const SOURCE_REPORT_PATH = resolve(
  ROOT,
  "reports/observatory/sentinel-2-source-intake.json",
);
const REPORT_PATH = resolve(
  ROOT,
  "reports/observatory/ndvi-2025-field-qa.json",
);
const SAMPLE_SIZE = 5_000;
const SAMPLE_SEED = 20250728;
const SAMPLE_SCALE_METERS = 10;
const ANALYSIS_CRS = "EPSG:32647";

dotenv.config({ path: resolve(ROOT, ".env.local"), quiet: true });

const startedAt = new Date().toISOString();
const [recipeRaw, sourceReportRaw] = await Promise.all([
  readFile(RECIPE_PATH, "utf8"),
  readFile(SOURCE_REPORT_PATH, "utf8"),
]);
const recipe = JSON.parse(recipeRaw);
const sourceReport = JSON.parse(sourceReportRaw);

assertPreconditions();
await initializeEarthEngine();

const manifest = sourceReport.version.sceneManifest;
const bounds = ee.Geometry.Rectangle(manifest.query.bounds, null, false);
const lockedCollection = ee
  .ImageCollection(recipe.source.collectionId)
  .filterBounds(bounds)
  .filterDate(manifest.query.start, manifest.query.endExclusive)
  .filter(ee.Filter.inList("system:index", manifest.sceneIds))
  .sort("system:time_start");
const currentSceneIds = await evaluate(
  lockedCollection.aggregate_array("system:index"),
);
const currentManifestChecksum = sha256(
  stableStringify({
    ...manifest,
    sceneIds: currentSceneIds,
    sensingTimes: await evaluate(
      lockedCollection.aggregate_array("system:time_start"),
    ),
  }),
);

if (currentManifestChecksum !== sourceReport.version.manifestChecksumSha256) {
  throw new Error(
    `Earth Engine scene manifest drifted: expected ` +
      `${sourceReport.version.manifestChecksumSha256}, received ` +
      `${currentManifestChecksum}`,
  );
}

const seasonResults = [];
for (const season of manifest.query.seasons) {
  console.log(`Computing ${season.id} field QA...`);
  const result = await runSeason(season);
  seasonResults.push(result);
  console.log(
    `${season.id}: coverage=${result.validCoverageEstimate}, ` +
      `scenes=${result.sceneCount}, status=${result.qualityStatus}`,
  );
}

const fieldBlockers = seasonResults.flatMap((season) =>
  season.blockers.map((blocker) => `${season.seasonId}: ${blocker}`),
);
const fieldQaPassed = fieldBlockers.length === 0;
const resultChecksumSha256 = sha256(
  stableStringify({
    sourceManifestChecksumSha256:
      sourceReport.version.manifestChecksumSha256,
    recipeChecksumSha256: sha256(recipeRaw),
    seasonResults,
  }),
);
const deterministicRunId = toUuid(
  sha256(
    [
      recipe.methodVersion,
      sourceReport.version.manifestChecksumSha256,
      manifest.analysisYear,
      manifest.query.bounds.join(","),
    ].join(":"),
  ),
);
const finishedAt = new Date().toISOString();

const report = {
  reportSchemaVersion: "observatory-field-qa/v1",
  productId: recipe.productId,
  methodVersion: recipe.methodVersion,
  analysisYear: manifest.analysisYear,
    executionClass: "offline-batch-research-preflight",
  startedAt,
  finishedAt,
  source: {
    datasetId: sourceReport.datasetId,
    versionLabel: sourceReport.version.versionLabel,
    manifestChecksumSha256:
      sourceReport.version.manifestChecksumSha256,
    sceneCount: sourceReport.inventory.sceneCount,
    manifestVerifiedAtExecution: true,
  },
  scope: {
    type: "research-envelope",
    bounds: manifest.query.bounds,
    boundaryGeometryUsed: false,
    districtStatisticsCreated: false,
  },
  processing: {
    analysisScaleMeters: recipe.processing.nativeScaleMeters,
    analysisCrs: recipe.processing.analysisCrs,
    qualityBandNativeScaleMeters:
      recipe.processing.qualityBandNativeScaleMeters,
    formula: recipe.processing.indexFormula,
    temporalComposite: recipe.temporal.composite,
    spatialAggregation: recipe.processing.spatialAggregation,
    clearSclClasses: recipe.quality.clearSclClasses,
    reflectanceValidRange: recipe.quality.reflectanceValidRange,
    sampling: {
      method: "deterministic random native-grid sample",
      requestedSampleSizePerSeason: SAMPLE_SIZE,
      seed: SAMPLE_SEED,
      scaleMeters: SAMPLE_SCALE_METERS,
      confidenceLevel: 0.95,
    },
  },
  gates: {
    minValidCoverage: recipe.quality.minValidCoverage,
    minSceneCount: recipe.quality.minSceneCount,
  },
  seasons: seasonResults,
  qa: {
    fieldQaStatus:
      fieldQaPassed ? "preflight-passed" : "preflight-failed",
    blockers: fieldBlockers,
    resultChecksumSha256,
  },
  processingRun: {
    deterministicRunId,
    seedPolicy: "seed only after a committed code SHA is available",
  },
  publication: {
    status: "blocked-boundary-and-exhaustive-qa-pending",
    productPublished: false,
    observationsCreated: false,
    rasterAssetsCreated: false,
    blocker:
      "Canonical district boundary and exhaustive native-grid QA are not validated.",
  },
};

if (process.argv.includes("--write-report")) {
  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

console.log(
  JSON.stringify({
    productId: report.productId,
    methodVersion: report.methodVersion,
    analysisYear: report.analysisYear,
    fieldQaStatus: report.qa.fieldQaStatus,
    publicationStatus: report.publication.status,
    deterministicRunId,
    reportWritten: process.argv.includes("--write-report"),
  }),
);

async function runSeason(season) {
  const seasonCollection = lockedCollection.filterDate(
    season.start,
    season.endExclusive,
  );
  const ndviCollection = seasonCollection.map(toMaskedNdvi);
  const composite = ndviCollection.median().rename("NDVI");
  const validMask = composite.mask().rename("valid").unmask(0);
  const sampledImage = composite
    .unmask(-2)
    .addBands(validMask)
    .addBands(
      ndviCollection
        .count()
        .rename("valid_observation_count")
        .unmask(0),
    );
  const samplePoints = ee.FeatureCollection.randomPoints(
    bounds,
    SAMPLE_SIZE,
    SAMPLE_SEED,
    1,
  );
  const samples = sampledImage.sampleRegions({
    collection: samplePoints,
    projection: ee.Projection(ANALYSIS_CRS).atScale(SAMPLE_SCALE_METERS),
    scale: SAMPLE_SCALE_METERS,
    tileScale: 8,
    geometries: false,
  });
  const validSamples = samples.filter(ee.Filter.eq("valid", 1));
  const metrics = await evaluate(
    ee.Dictionary({
      sceneCount: seasonCollection.size(),
      totalAreaSquareMeters: bounds.area({ maxError: 1 }),
      sampleCount: samples.size(),
      validSampleCount: validSamples.size(),
      sampledValidObservationCount: samples.aggregate_sum(
        "valid_observation_count",
      ),
      meanValidObservationsPerSample: samples.aggregate_mean(
        "valid_observation_count",
      ),
      percentileStats: validSamples.reduceColumns({
        reducer: ee.Reducer.percentile([10, 25, 50, 75, 90]),
        selectors: ["NDVI"],
      }),
    }),
  );

  const validCoverageEstimate = round(
    metrics.validSampleCount / metrics.sampleCount,
    recipe.processing.roundingDecimals,
  );
  const coverageConfidence95 = wilsonInterval(
    metrics.validSampleCount,
    metrics.sampleCount,
    recipe.processing.roundingDecimals,
  );
  const statistics = {
    median: round(
      metrics.percentileStats.p50,
      recipe.processing.roundingDecimals,
    ),
    p10: round(
      metrics.percentileStats.p10,
      recipe.processing.roundingDecimals,
    ),
    p90: round(
      metrics.percentileStats.p90,
      recipe.processing.roundingDecimals,
    ),
    interquartileRange: round(
      metrics.percentileStats.p75 - metrics.percentileStats.p25,
      recipe.processing.roundingDecimals,
    ),
  };
  const blockers = [];

  if (coverageConfidence95.lower < recipe.quality.minValidCoverage) {
    blockers.push(
      `95% lower coverage bound ${coverageConfidence95.lower} is below ` +
        `${recipe.quality.minValidCoverage}`,
    );
  }
  if (metrics.sceneCount < recipe.quality.minSceneCount) {
    blockers.push(
      `scene count ${metrics.sceneCount} is below ` +
        `${recipe.quality.minSceneCount}`,
    );
  }
  for (const [statistic, value] of Object.entries(statistics)) {
    if (!Number.isFinite(value)) {
      blockers.push(`${statistic} is not finite`);
    }
  }
  if (metrics.sampledValidObservationCount < 1) {
    blockers.push("sampled valid observation count is zero");
  }

  return {
    seasonId: season.id,
    periodStart: `${season.start}T00:00:00.000Z`,
    periodEndExclusive: `${season.endExclusive}T00:00:00.000Z`,
    sceneCount: metrics.sceneCount,
    requestedSampleSize: SAMPLE_SIZE,
    sampleCount: metrics.sampleCount,
    validSampleCount: metrics.validSampleCount,
    validCoverageEstimate,
    coverageConfidence95,
    sampledValidObservationCount:
      metrics.sampledValidObservationCount,
    meanValidObservationsPerSample: round(
      metrics.meanValidObservationsPerSample,
      recipe.processing.roundingDecimals,
    ),
    totalAreaSquareMeters: round(metrics.totalAreaSquareMeters, 3),
    validAreaEstimateSquareMeters: round(
      metrics.totalAreaSquareMeters * validCoverageEstimate,
      3,
    ),
    statistics,
    qualityStatus:
      blockers.length === 0 ? "preflight-accepted" : "preflight-rejected",
    blockers,
  };
}

function toMaskedNdvi(image) {
  const nir = image
    .select(recipe.source.bands.nir)
    .multiply(recipe.source.reflectanceScaleFactor);
  const red = image
    .select(recipe.source.bands.red)
    .multiply(recipe.source.reflectanceScaleFactor);
  const scl = image.select(recipe.source.bands.quality);
  const [reflectanceMin, reflectanceMax] =
    recipe.quality.reflectanceValidRange;
  const clearMask = recipe.quality.clearSclClasses
    .map((value) => scl.eq(value))
    .reduce((combined, current) => combined.or(current));
  const reflectanceMask = nir
    .gte(reflectanceMin)
    .and(nir.lte(reflectanceMax))
    .and(red.gte(reflectanceMin))
    .and(red.lte(reflectanceMax));
  const denominator = nir.add(red);
  const ndvi = nir.subtract(red).divide(denominator);
  const validNdvi = ndvi.gte(-1).and(ndvi.lte(1));

  return ndvi
    .updateMask(
      clearMask
        .and(reflectanceMask)
        .and(denominator.neq(0))
        .and(validNdvi),
    )
    .rename("NDVI")
    .copyProperties(image, ["system:index", "system:time_start"]);
}

function assertPreconditions() {
  if (sourceReport.acceptance.status !== "validated") {
    throw new Error("Sentinel-2 source intake is not validated");
  }
  if (
    sourceReport.version.sceneManifest.sceneIds.length
    !== sourceReport.inventory.sceneCount
  ) {
    throw new Error("Sentinel-2 scene manifest is incomplete");
  }
  if (recipe.executionClass !== "offline-batch") {
    throw new Error("NDVI recipe must remain offline-batch");
  }
  if (recipe.publication.allowsPublicRequestProcessing !== false) {
    throw new Error("NDVI recipe unexpectedly allows public processing");
  }
  if (recipe.processing.nativeScaleMeters !== SAMPLE_SCALE_METERS) {
    throw new Error("Field QA reduce scale does not match the NDVI recipe");
  }
  if (recipe.processing.analysisCrs !== ANALYSIS_CRS) {
    throw new Error("Field QA CRS does not match the NDVI recipe");
  }
}

function initializeEarthEngine() {
  const serviceAccountJson = process.env.GEE_SERVICE_ACCOUNT_JSON;
  const credentials = serviceAccountJson
    ? JSON.parse(serviceAccountJson)
    : {
        client_email: process.env.GEE_CLIENT_EMAIL,
        private_key: process.env.GEE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        project_id: process.env.GEE_PROJECT_ID,
      };

  if (!credentials.client_email || !credentials.private_key) {
    throw new Error(
      "Missing GEE_SERVICE_ACCOUNT_JSON or GEE_CLIENT_EMAIL/GEE_PRIVATE_KEY",
    );
  }

  return new Promise((resolvePromise, rejectPromise) => {
    ee.data.authenticateViaPrivateKey(
      credentials,
      () => {
        ee.initialize(
          null,
          null,
          resolvePromise,
          rejectPromise,
          null,
          credentials.project_id,
        );
      },
      rejectPromise,
    );
  });
}

function evaluate(computedObject) {
  return new Promise((resolvePromise, rejectPromise) => {
    computedObject.evaluate(resolvePromise, rejectPromise);
  });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function wilsonInterval(successes, trials, decimals) {
  if (!Number.isFinite(successes) || !Number.isFinite(trials) || trials < 1) {
    throw new Error("Wilson interval requires a non-empty sample");
  }
  const z = 1.959963984540054;
  const proportion = successes / trials;
  const denominator = 1 + (z ** 2) / trials;
  const center =
    (proportion + (z ** 2) / (2 * trials)) / denominator;
  const margin =
    (z
      * Math.sqrt(
        (proportion * (1 - proportion)) / trials
          + (z ** 2) / (4 * trials ** 2),
      ))
    / denominator;

  return {
    lower: round(Math.max(0, center - margin), decimals),
    upper: round(Math.min(1, center + margin), decimals),
  };
}

function toUuid(hex) {
  const normalized =
    `${hex.slice(0, 12)}5${hex.slice(13, 16)}` +
    `8${hex.slice(17, 32)}`;
  return [
    normalized.slice(0, 8),
    normalized.slice(8, 12),
    normalized.slice(12, 16),
    normalized.slice(16, 20),
    normalized.slice(20, 32),
  ].join("-");
}
