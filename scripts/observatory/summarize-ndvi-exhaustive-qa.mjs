import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PLAN_PATH = resolve(
  ROOT,
  "reports/observatory/ndvi-2025-exhaustive-plan.json",
);
const RECIPE_PATH = resolve(
  ROOT,
  "config/observatory/recipes/ndvi-seasonal-v1.0.0.json",
);
const REPORT_PATH = resolve(
  ROOT,
  "reports/observatory/ndvi-2025-exhaustive-qa.json",
);

dotenv.config({ path: resolve(ROOT, ".env.local"), quiet: true });

const [planRaw, recipeRaw] = await Promise.all([
  readFile(PLAN_PATH, "utf8"),
  readFile(RECIPE_PATH, "utf8"),
]);
const plan = JSON.parse(planRaw);
const recipe = JSON.parse(recipeRaw);
const supabase = createServiceClient();
const [{ data: run, error: runError }, { data: tiles, error: tileError }] =
  await Promise.all([
    supabase
      .from("observatory_processing_runs")
      .select(
        "processing_run_id,product_id,method_version,code_commit_sha,status,started_at,finished_at,qa_summary",
      )
      .eq("processing_run_id", plan.processingRunId)
      .single(),
    supabase
      .from("observatory_processing_tiles")
      .select(
        "processing_tile_id,tile_id,season_id,bounds,status,attempt_count,max_attempts,metrics,result_checksum_sha256",
      )
      .eq("processing_run_id", plan.processingRunId)
      .order("season_id")
      .order("tile_id"),
  ]);

if (runError) {
  throw new Error(`Processing run: ${runError.message}`);
}
if (tileError) {
  throw new Error(`Processing tiles: ${tileError.message}`);
}

assertRun();

const checksumErrors = [];
const qualityRejectedJobs = [];
for (const tile of tiles) {
  const actualChecksum = sha256(stableStringify(tile.metrics));
  if (actualChecksum !== tile.result_checksum_sha256) {
    checksumErrors.push(tileJobId(tile));
  }
  if (tile.metrics.qualityStatus !== "accepted") {
    qualityRejectedJobs.push(tileJobId(tile));
  }
}

if (checksumErrors.length > 0) {
  throw new Error(
    `Tile metric checksum mismatch: ${checksumErrors.join(", ")}`,
  );
}

const seasons = ["hot", "wet", "cool"].map((seasonId) => {
  const seasonTiles = tiles.filter((tile) => tile.season_id === seasonId);
  const totals = seasonTiles.reduce(
    (summary, tile) => {
      summary.totalAreaSquareMeters +=
        tile.metrics.totalAreaSquareMeters;
      summary.validAreaSquareMeters +=
        tile.metrics.validAreaSquareMeters;
      summary.validObservationCount +=
        tile.metrics.validObservationCount;
      summary.minTileCoverage = Math.min(
        summary.minTileCoverage,
        tile.metrics.validCoverage,
      );
      summary.maxTileCoverage = Math.max(
        summary.maxTileCoverage,
        tile.metrics.validCoverage,
      );
      summary.minSceneCount = Math.min(
        summary.minSceneCount,
        tile.metrics.sceneCount,
      );
      summary.maxSceneCount = Math.max(
        summary.maxSceneCount,
        tile.metrics.sceneCount,
      );
      summary.totalAttempts += tile.attempt_count;
      return summary;
    },
    {
      totalAreaSquareMeters: 0,
      validAreaSquareMeters: 0,
      validObservationCount: 0,
      minTileCoverage: 1,
      maxTileCoverage: 0,
      minSceneCount: Number.POSITIVE_INFINITY,
      maxSceneCount: 0,
      totalAttempts: 0,
    },
  );

  return {
    seasonId,
    succeededJobs: seasonTiles.length,
    failedJobs: 0,
    totalAttempts: totals.totalAttempts,
    totalAreaSquareMeters: round(totals.totalAreaSquareMeters, 3),
    validAreaSquareMeters: round(totals.validAreaSquareMeters, 3),
    validCoverage: round(
      totals.validAreaSquareMeters / totals.totalAreaSquareMeters,
      recipe.processing.roundingDecimals,
    ),
    validObservationCount: totals.validObservationCount,
    minTileCoverage: totals.minTileCoverage,
    maxTileCoverage: totals.maxTileCoverage,
    minSceneCount: totals.minSceneCount,
    maxSceneCount: totals.maxSceneCount,
    qualityStatus: "accepted",
  };
});
const resultChecksumSha256 = sha256(
  stableStringify(
    tiles.map((tile) => ({
      tileId: tile.tile_id,
      seasonId: tile.season_id,
      metricsChecksumSha256: tile.result_checksum_sha256,
    })),
  ),
);
const report = {
  reportSchemaVersion: "observatory-exhaustive-qa/v1",
  createdAt: new Date().toISOString(),
  productId: plan.productId,
  productMethodVersion: plan.productMethodVersion,
  qaMethodVersion: plan.qaMethodVersion,
  analysisYear: plan.analysisYear,
  processingRun: {
    processingRunId: run.processing_run_id,
    codeCommitSha: run.code_commit_sha,
    status: run.status,
    startedAt: run.started_at,
    finishedAt: run.finished_at,
  },
  source: {
    datasetId: plan.sourceDatasetId,
    versionLabel: plan.sourceVersionLabel,
    manifestChecksumSha256:
      plan.sourceManifestChecksumSha256,
  },
  plan: {
    planChecksumSha256: plan.planChecksumSha256,
    tileCount: plan.summary.tileCount,
    seasonCount: plan.summary.seasonCount,
    jobCount: plan.summary.jobCount,
  },
  execution: {
    succeededJobs: tiles.length,
    failedJobs: 0,
    rejectedJobs: qualityRejectedJobs.length,
    totalAttempts: tiles.reduce(
      (sum, tile) => sum + tile.attempt_count,
      0,
    ),
    checksumVerifiedJobs: tiles.length,
    retryCount: tiles.reduce(
      (sum, tile) => sum + Math.max(0, tile.attempt_count - 1),
      0,
    ),
    resultChecksumSha256,
  },
  seasons,
  qa: {
    status:
      qualityRejectedJobs.length === 0
        ? "passed-research-envelope"
        : "failed",
    blockers:
      qualityRejectedJobs.length === 0
        ? []
        : qualityRejectedJobs.map((jobId) => `${jobId} was rejected`),
    exhaustiveCoverage: true,
    globalPercentilesCalculated: false,
    note:
      "Tile percentiles are diagnostics only; global percentile aggregation is intentionally omitted.",
  },
  publication: {
    status: "blocked-canonical-boundary-pending",
    productPublished: false,
    observationsCreated: false,
    rasterAssetsCreated: false,
  },
};

if (process.argv.includes("--write-report")) {
  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

console.log(
  JSON.stringify({
    processingRunId: run.processing_run_id,
    jobs: tiles.length,
    retries: report.execution.retryCount,
    status: report.qa.status,
    seasons: Object.fromEntries(
      seasons.map((season) => [
        season.seasonId,
        season.validCoverage,
      ]),
    ),
    resultChecksumSha256,
    reportWritten: process.argv.includes("--write-report"),
  }),
);

function assertRun() {
  if (plan.reportSchemaVersion !== "observatory-exhaustive-plan/v1") {
    throw new Error("Unsupported exhaustive plan schema");
  }
  if (run.status !== "succeeded") {
    throw new Error(`Processing run is ${run.status}, not succeeded`);
  }
  if (
    run.product_id !== plan.productId
    || run.method_version !== plan.productMethodVersion
  ) {
    throw new Error("Processing run product or method does not match plan");
  }
  if (tiles.length !== plan.summary.jobCount) {
    throw new Error(
      `Expected ${plan.summary.jobCount} tiles, received ${tiles.length}`,
    );
  }
  const incomplete = tiles.filter((tile) => tile.status !== "succeeded");
  if (incomplete.length > 0) {
    throw new Error(
      `Incomplete tile jobs: ${incomplete.map(tileJobId).join(", ")}`,
    );
  }
}

function tileJobId(tile) {
  return `${tile.season_id}-${tile.tile_id}`;
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
