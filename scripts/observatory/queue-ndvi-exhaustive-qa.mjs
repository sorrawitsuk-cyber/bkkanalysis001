import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REPORT_PATH = resolve(
  ROOT,
  "reports/observatory/ndvi-2025-exhaustive-plan.json",
);
const APPLY = process.argv.includes("--apply");
const RETRY_FAILED = process.argv.includes("--retry-failed");

dotenv.config({ path: resolve(ROOT, ".env.local"), quiet: true });

const report = JSON.parse(await readFile(REPORT_PATH, "utf8"));
const codeCommitSha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: ROOT,
  encoding: "utf8",
}).trim();

assertReport();

if (!APPLY) {
  console.log(
    JSON.stringify({
      mode: "plan",
      processingRunId: report.processingRunId,
      codeCommitSha,
      jobs: report.jobs.length,
      retryFailed: RETRY_FAILED,
      writes: 0,
    }),
  );
  process.exit(0);
}

const supabase = createServiceClient();
const { data: datasetVersion, error: versionError } = await supabase
  .from("observatory_dataset_versions")
  .select("dataset_version_id,dataset_id,checksum_sha256,acceptance_status")
  .eq("dataset_id", report.sourceDatasetId)
  .eq("checksum_sha256", report.sourceManifestChecksumSha256)
  .eq("acceptance_status", "validated")
  .single();

if (versionError) {
  throw new Error(`Sentinel-2 dataset version: ${versionError.message}`);
}

const runRow = {
  processing_run_id: report.processingRunId,
  product_id: report.productId,
  method_version: report.productMethodVersion,
  code_commit_sha: codeCommitSha,
  parameters: {
    executionClass: "offline-tiled-batch",
    qaMethodVersion: report.qaMethodVersion,
    analysisYear: report.analysisYear,
    sourceManifestChecksumSha256:
      report.sourceManifestChecksumSha256,
    planChecksumSha256: report.planChecksumSha256,
    grid: report.grid,
    processing: report.processing,
    publicationDisabled: true,
  },
  qa_summary: {
    status: "queued",
    totalJobs: report.jobs.length,
    queuedJobs: report.jobs.length,
    runningJobs: 0,
    succeededJobs: 0,
    failedJobs: 0,
    publicationStatus: "blocked-canonical-boundary-pending",
  },
  status: "queued",
};
const { error: runError } = await supabase
  .from("observatory_processing_runs")
  .upsert(runRow, {
    onConflict: "processing_run_id",
    ignoreDuplicates: true,
  });

if (runError) {
  throw new Error(`observatory_processing_runs: ${runError.message}`);
}

const tileRows = report.jobs.map((job) => ({
  processing_run_id: report.processingRunId,
  tile_id: job.tileId,
  season_id: job.seasonId,
  bounds: job.bounds,
  status: "queued",
  attempt_count: 0,
  max_attempts: job.maxAttempts,
}));
const { error: tileError } = await supabase
  .from("observatory_processing_tiles")
  .upsert(tileRows, {
    onConflict: "processing_run_id,tile_id,season_id",
    ignoreDuplicates: true,
  });

if (tileError) {
  throw new Error(`observatory_processing_tiles: ${tileError.message}`);
}

const { error: inputError } = await supabase
  .from("observatory_processing_run_inputs")
  .upsert(
    {
      processing_run_id: report.processingRunId,
      dataset_version_id: datasetVersion.dataset_version_id,
      input_role: "primary-raster",
    },
    { onConflict: "processing_run_id,dataset_version_id" },
  );

if (inputError) {
  throw new Error(`observatory_processing_run_inputs: ${inputError.message}`);
}

if (RETRY_FAILED) {
  const maxAttempts = Math.max(...report.jobs.map((job) => job.maxAttempts));
  const { error: retryError } = await supabase
    .from("observatory_processing_tiles")
    .update({
      status: "queued",
      worker_id: null,
      finished_at: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("processing_run_id", report.processingRunId)
    .eq("status", "failed")
    .lt("attempt_count", maxAttempts);

  if (retryError) {
    throw new Error(`Retry failed jobs: ${retryError.message}`);
  }

  const { error: runRetryError } = await supabase
    .from("observatory_processing_runs")
    .update({
      status: "queued",
      finished_at: null,
      qa_summary: {
        status: "queued-for-retry",
        publicationStatus: "blocked-canonical-boundary-pending",
      },
    })
    .eq("processing_run_id", report.processingRunId)
    .in("status", ["failed", "rejected"]);

  if (runRetryError) {
    throw new Error(`Reset processing run for retry: ${runRetryError.message}`);
  }
}

const progress = await getProgress(supabase, report.processingRunId);
console.log(
  JSON.stringify({
    mode: "apply",
    result: "exhaustive-qa-queue-synced",
    processingRunId: report.processingRunId,
    codeCommitSha,
    datasetVersionId: datasetVersion.dataset_version_id,
    retryFailed: RETRY_FAILED,
    progress,
    observationsWritten: 0,
    rasterAssetsWritten: 0,
  }),
);

async function getProgress(client, processingRunId) {
  const { data, error } = await client
    .from("observatory_processing_tiles")
    .select("status")
    .eq("processing_run_id", processingRunId);

  if (error) {
    throw new Error(`Queue verification: ${error.message}`);
  }

  return data.reduce(
    (counts, row) => {
      counts.total += 1;
      counts[row.status] += 1;
      return counts;
    },
    { total: 0, queued: 0, running: 0, succeeded: 0, failed: 0 },
  );
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

function assertReport() {
  if (report.reportSchemaVersion !== "observatory-exhaustive-plan/v1") {
    throw new Error("Unsupported exhaustive QA plan");
  }
  if (report.summary.jobCount !== report.jobs.length) {
    throw new Error("Exhaustive QA plan job count is inconsistent");
  }
  if (
    report.publication.productPublished
    || report.publication.observationsCreated
    || report.publication.rasterAssetsCreated
  ) {
    throw new Error("Exhaustive QA plan unexpectedly permits publication");
  }
}
