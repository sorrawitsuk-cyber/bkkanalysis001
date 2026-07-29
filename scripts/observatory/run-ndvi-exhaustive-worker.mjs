import { createHash, randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ee from "@google/earthengine";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const QA_CONFIG_PATH = resolve(
  ROOT,
  "config/observatory/qa/ndvi-exhaustive-coverage-v1.0.0.json",
);
const RECIPE_PATH = resolve(
  ROOT,
  "config/observatory/recipes/ndvi-seasonal-v1.0.0.json",
);
const SOURCE_REPORT_PATH = resolve(
  ROOT,
  "reports/observatory/sentinel-2-source-intake.json",
);
const PLAN_PATH = resolve(
  ROOT,
  "reports/observatory/ndvi-2025-exhaustive-plan.json",
);

dotenv.config({ path: resolve(ROOT, ".env.local"), quiet: true });

const [configRaw, recipeRaw, sourceReportRaw, planRaw] = await Promise.all([
  readFile(QA_CONFIG_PATH, "utf8"),
  readFile(RECIPE_PATH, "utf8"),
  readFile(SOURCE_REPORT_PATH, "utf8"),
  readFile(PLAN_PATH, "utf8"),
]);
const config = JSON.parse(configRaw);
const recipe = JSON.parse(recipeRaw);
const sourceReport = JSON.parse(sourceReportRaw);
const plan = JSON.parse(planRaw);
const maxJobs = parsePositiveInteger("--max-jobs", 1);
const workerId =
  getArgumentValue("--worker-id")
  ?? `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
const supabase = createServiceClient();

assertPreconditions();
await initializeEarthEngine();

let processedJobs = 0;
let failedJobs = 0;

while (processedJobs < maxJobs) {
  const tile = await claimTile();
  if (!tile) {
    break;
  }

  console.log(
    `Claimed ${tile.season_id}/${tile.tile_id} `
      + `(attempt ${tile.attempt_count}/${tile.max_attempts})`,
  );
  await markRunRunning();

  try {
    const metrics = await processTile(tile);
    const checksum = sha256(stableStringify(metrics));
    const finishedAt = new Date().toISOString();
    const { error } = await supabase
      .from("observatory_processing_tiles")
      .update({
        status: "succeeded",
        metrics,
        result_checksum_sha256: checksum,
        last_error: null,
        finished_at: finishedAt,
        updated_at: finishedAt,
      })
      .eq("processing_tile_id", tile.processing_tile_id)
      .eq("status", "running")
      .eq("worker_id", workerId);

    if (error) {
      throw new Error(`Complete tile checkpoint: ${error.message}`);
    }

    console.log(
      `${tile.season_id}/${tile.tile_id}: `
        + `coverage=${metrics.validCoverage}, `
        + `scenes=${metrics.sceneCount}, `
        + `quality=${metrics.qualityStatus}`,
    );
  } catch (error) {
    failedJobs += 1;
    const message = sanitizeError(error);
    const finishedAt = new Date().toISOString();
    const { error: checkpointError } = await supabase
      .from("observatory_processing_tiles")
      .update({
        status: "failed",
        last_error: message,
        finished_at: finishedAt,
        updated_at: finishedAt,
      })
      .eq("processing_tile_id", tile.processing_tile_id)
      .eq("worker_id", workerId);

    if (checkpointError) {
      throw new Error(
        `${message}; failed to checkpoint error: ${checkpointError.message}`,
      );
    }
    console.error(`${tile.season_id}/${tile.tile_id}: ${message}`);
  }

  processedJobs += 1;
  await refreshRunProgress();
}

const progress = await getProgress();
console.log(
  JSON.stringify({
    result: "worker-finished",
    processingRunId: plan.processingRunId,
    workerId,
    processedJobs,
    failedJobs,
    progress,
    publicationStatus: "blocked-canonical-boundary-pending",
    observationsWritten: 0,
    rasterAssetsWritten: 0,
  }),
);

if (failedJobs > 0) {
  process.exitCode = 1;
}

async function claimTile() {
  const { data, error } = await supabase.rpc(
    "observatory_claim_processing_tile",
    {
      p_processing_run_id: plan.processingRunId,
      p_worker_id: workerId,
    },
  );

  if (error) {
    throw new Error(`Claim tile: ${error.message}`);
  }
  return data?.[0] ?? null;
}

async function processTile(tile) {
  const season = sourceReport.version.sceneManifest.query.seasons.find(
    (item) => item.id === tile.season_id,
  );
  if (!season) {
    throw new Error(`Unknown season ${tile.season_id}`);
  }

  const bounds = ee.Geometry.Rectangle(tile.bounds, null, false);
  const collection = ee
    .ImageCollection(recipe.source.collectionId)
    .filterBounds(bounds)
    .filterDate(season.start, season.endExclusive)
    .filter(
      ee.Filter.inList(
        "system:index",
        sourceReport.version.sceneManifest.sceneIds,
      ),
    )
    .sort("system:time_start");
  const ndviCollection = collection.map(toMaskedNdvi);
  const composite = ndviCollection.median().rename("NDVI");
  const validMask = composite.mask().rename("valid");
  const pixelArea = ee.Image.pixelArea().rename("area");
  const validArea = pixelArea.updateMask(validMask);
  const validObservationCount = ndviCollection
    .count()
    .rename("valid_observation_count");
  const reduceOptions = {
    geometry: bounds,
    scale: config.processing.analysisScaleMeters,
    crs: config.processing.analysisCrs,
    maxPixels: config.processing.maxPixelsPerReducer,
    tileScale: config.processing.tileScale,
  };
  const raw = await evaluate(
    ee.Dictionary({
      sceneCount: collection.size(),
      totalAreaSquareMeters: bounds.area({ maxError: 1 }),
      validAreaSquareMeters: validArea
        .reduceRegion({
          reducer: ee.Reducer.sum(),
          ...reduceOptions,
        })
        .get("area"),
      validObservationCount: validObservationCount
        .reduceRegion({
          reducer: ee.Reducer.sum(),
          ...reduceOptions,
        })
        .get("valid_observation_count"),
      percentileStats: composite.reduceRegion({
        reducer: ee.Reducer.percentile([10, 25, 50, 75, 90]),
        ...reduceOptions,
      }),
    }),
  );
  const validCoverage = round(
    raw.validAreaSquareMeters / raw.totalAreaSquareMeters,
    recipe.processing.roundingDecimals,
  );
  const statistics = {
    median: round(
      raw.percentileStats.NDVI_p50,
      recipe.processing.roundingDecimals,
    ),
    p10: round(
      raw.percentileStats.NDVI_p10,
      recipe.processing.roundingDecimals,
    ),
    p90: round(
      raw.percentileStats.NDVI_p90,
      recipe.processing.roundingDecimals,
    ),
    interquartileRange: round(
      raw.percentileStats.NDVI_p75
        - raw.percentileStats.NDVI_p25,
      recipe.processing.roundingDecimals,
    ),
  };
  const blockers = [];

  if (validCoverage < recipe.quality.minValidCoverage) {
    blockers.push(
      `valid coverage ${validCoverage} is below `
        + `${recipe.quality.minValidCoverage}`,
    );
  }
  if (raw.sceneCount < recipe.quality.minSceneCount) {
    blockers.push(
      `scene count ${raw.sceneCount} is below `
        + `${recipe.quality.minSceneCount}`,
    );
  }
  if (raw.validObservationCount < 1) {
    blockers.push("valid observation count is zero");
  }
  for (const [name, value] of Object.entries(statistics)) {
    if (!Number.isFinite(value)) {
      blockers.push(`${name} is not finite`);
    }
  }

  return {
    metricSchemaVersion: "observatory-tile-coverage/v1",
    qaMethodVersion: config.qaMethodVersion,
    tileId: tile.tile_id,
    seasonId: tile.season_id,
    bounds: tile.bounds,
    periodStart: `${season.start}T00:00:00.000Z`,
    periodEndExclusive: `${season.endExclusive}T00:00:00.000Z`,
    sceneCount: raw.sceneCount,
    totalAreaSquareMeters: round(raw.totalAreaSquareMeters, 3),
    validAreaSquareMeters: round(raw.validAreaSquareMeters, 3),
    validCoverage,
    validObservationCount: raw.validObservationCount,
    statistics,
    qualityStatus: blockers.length === 0 ? "accepted" : "rejected",
    blockers,
    sourceManifestChecksumSha256:
      sourceReport.version.manifestChecksumSha256,
    boundaryGeometryUsed: false,
    observationsCreated: false,
    rasterAssetsCreated: false,
  };
}

async function markRunRunning() {
  const { data: run, error: readError } = await supabase
    .from("observatory_processing_runs")
    .select("status,started_at")
    .eq("processing_run_id", plan.processingRunId)
    .single();

  if (readError) {
    throw new Error(`Read processing run: ${readError.message}`);
  }
  if (run.status === "queued") {
    const { error } = await supabase
      .from("observatory_processing_runs")
      .update({
        status: "running",
        started_at: run.started_at ?? new Date().toISOString(),
      })
      .eq("processing_run_id", plan.processingRunId)
      .eq("status", "queued");

    if (error) {
      throw new Error(`Start processing run: ${error.message}`);
    }
  }
}

async function refreshRunProgress() {
  const { data: tiles, error } = await supabase
    .from("observatory_processing_tiles")
    .select("status,metrics")
    .eq("processing_run_id", plan.processingRunId);

  if (error) {
    throw new Error(`Read tile progress: ${error.message}`);
  }

  const progress = countStatuses(tiles);
  const terminal = progress.succeeded + progress.failed === progress.total;
  const rejectedTiles = tiles.filter(
    (tile) =>
      tile.status === "succeeded"
      && tile.metrics?.qualityStatus === "rejected",
  );
  const totals = tiles
    .filter((tile) => tile.status === "succeeded")
    .reduce(
      (summary, tile) => {
        summary.totalAreaSquareMeters +=
          tile.metrics.totalAreaSquareMeters;
        summary.validAreaSquareMeters +=
          tile.metrics.validAreaSquareMeters;
        summary.validObservationCount +=
          tile.metrics.validObservationCount;
        return summary;
      },
      {
        totalAreaSquareMeters: 0,
        validAreaSquareMeters: 0,
        validObservationCount: 0,
      },
    );
  const aggregateCoverage =
    totals.totalAreaSquareMeters > 0
      ? round(
          totals.validAreaSquareMeters / totals.totalAreaSquareMeters,
          recipe.processing.roundingDecimals,
        )
      : null;
  const runStatus = terminal
    ? progress.failed === 0 && rejectedTiles.length === 0
      ? "succeeded"
      : "rejected"
    : "running";
  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("observatory_processing_runs")
    .update({
      status: runStatus,
      finished_at: terminal ? now : null,
      qa_summary: {
        status: runStatus,
        ...progress,
        rejectedTileCount: rejectedTiles.length,
        aggregateCoverage,
        ...totals,
        publicationStatus: "blocked-canonical-boundary-pending",
      },
    })
    .eq("processing_run_id", plan.processingRunId);

  if (updateError) {
    throw new Error(`Update run progress: ${updateError.message}`);
  }
}

async function getProgress() {
  const { data, error } = await supabase
    .from("observatory_processing_tiles")
    .select("status")
    .eq("processing_run_id", plan.processingRunId);

  if (error) {
    throw new Error(`Read final progress: ${error.message}`);
  }
  return countStatuses(data);
}

function countStatuses(tiles) {
  return tiles.reduce(
    (counts, tile) => {
      counts.total += 1;
      counts[tile.status] += 1;
      return counts;
    },
    { total: 0, queued: 0, running: 0, succeeded: 0, failed: 0 },
  );
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

  return ndvi
    .updateMask(
      clearMask
        .and(reflectanceMask)
        .and(denominator.neq(0))
        .and(ndvi.gte(-1))
        .and(ndvi.lte(1)),
    )
    .rename("NDVI")
    .copyProperties(image, ["system:index", "system:time_start"]);
}

function assertPreconditions() {
  if (plan.reportSchemaVersion !== "observatory-exhaustive-plan/v1") {
    throw new Error("Unsupported exhaustive QA plan");
  }
  if (plan.qaMethodVersion !== config.qaMethodVersion) {
    throw new Error("Plan and tiled QA config do not match");
  }
  if (plan.productMethodVersion !== recipe.methodVersion) {
    throw new Error("Plan and NDVI recipe do not match");
  }
  if (
    plan.sourceManifestChecksumSha256
    !== sourceReport.version.manifestChecksumSha256
  ) {
    throw new Error("Plan and source scene manifest do not match");
  }
  if (sourceReport.acceptance.status !== "validated") {
    throw new Error("Sentinel-2 source is not validated");
  }
  if (
    !sourceReport.version.sceneManifest.query.seasons.every((season) =>
      ["hot", "wet", "cool"].includes(season.id),
    )
  ) {
    throw new Error("Source manifest contains an unsupported season");
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

function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  if (serviceRoleKey === anonKey) {
    throw new Error("Service-role key must not be the anonymous key");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function parsePositiveInteger(name, fallback) {
  const value = getArgumentValue(name);
  if (value === null) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function getArgumentValue(name) {
  const prefix = `${name}=`;
  const argument = process.argv.find((item) => item.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : null;
}

function sanitizeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .slice(0, 2000);
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
