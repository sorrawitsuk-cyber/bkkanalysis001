import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REPORT_PATH = resolve(
  ROOT,
  "reports/observatory/ndvi-2025-field-qa.json",
);
const APPLY = process.argv.includes("--apply");

dotenv.config({ path: resolve(ROOT, ".env.local"), quiet: true });

const report = JSON.parse(await readFile(REPORT_PATH, "utf8"));
const codeCommitSha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: ROOT,
  encoding: "utf8",
}).trim();

assertReport();

const runRow = {
  processing_run_id: report.processingRun.deterministicRunId,
  product_id: report.productId,
  method_version: report.methodVersion,
  code_commit_sha: codeCommitSha,
  parameters: {
    analysisYear: report.analysisYear,
    executionClass: report.executionClass,
    scope: report.scope,
    processing: report.processing,
    gates: report.gates,
    sourceManifestChecksumSha256:
      report.source.manifestChecksumSha256,
    publishingDisabled: true,
  },
  qa_summary: {
    fieldQaStatus: report.qa.fieldQaStatus,
    resultChecksumSha256: report.qa.resultChecksumSha256,
    seasons: report.seasons.map((season) => ({
      seasonId: season.seasonId,
      sceneCount: season.sceneCount,
      validCoverageEstimate: season.validCoverageEstimate,
      coverageConfidence95: season.coverageConfidence95,
      qualityStatus: season.qualityStatus,
    })),
    publicationStatus: report.publication.status,
    publicationBlocker: report.publication.blocker,
  },
  status:
    report.qa.fieldQaStatus === "preflight-passed"
      ? "succeeded"
      : "rejected",
  started_at: report.startedAt,
  finished_at: report.finishedAt,
};

if (!APPLY) {
  console.log(
    JSON.stringify({
      mode: "plan",
      processingRunId: runRow.processing_run_id,
      productId: runRow.product_id,
      codeCommitSha,
      runStatus: runRow.status,
      observationsWritten: 0,
      rasterAssetsWritten: 0,
    }),
  );
  process.exit(0);
}

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

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
const { data: datasetVersion, error: versionError } = await supabase
  .from("observatory_dataset_versions")
  .select("dataset_version_id,dataset_id,checksum_sha256,acceptance_status")
  .eq("dataset_id", report.source.datasetId)
  .eq("checksum_sha256", report.source.manifestChecksumSha256)
  .eq("acceptance_status", "validated")
  .single();

if (versionError) {
  throw new Error(`Sentinel-2 dataset version: ${versionError.message}`);
}

const { data: run, error: runError } = await supabase
  .from("observatory_processing_runs")
  .upsert(runRow, { onConflict: "processing_run_id" })
  .select("processing_run_id,product_id,status,code_commit_sha")
  .single();

if (runError) {
  throw new Error(`observatory_processing_runs: ${runError.message}`);
}

const { error: inputError } = await supabase
  .from("observatory_processing_run_inputs")
  .upsert(
    {
      processing_run_id: run.processing_run_id,
      dataset_version_id: datasetVersion.dataset_version_id,
      input_role: "primary-raster",
    },
    { onConflict: "processing_run_id,dataset_version_id" },
  );

if (inputError) {
  throw new Error(`observatory_processing_run_inputs: ${inputError.message}`);
}

console.log(
  JSON.stringify({
    mode: "apply",
    result: "internal-field-qa-run-synced",
    processingRunId: run.processing_run_id,
    productId: run.product_id,
    codeCommitSha: run.code_commit_sha,
    runStatus: run.status,
    datasetVersionId: datasetVersion.dataset_version_id,
    publicProductStatus: "acceptance",
    observationsWritten: 0,
    rasterAssetsWritten: 0,
  }),
);

function assertReport() {
  if (report.reportSchemaVersion !== "observatory-field-qa/v1") {
    throw new Error("Unsupported field QA report schema");
  }
  if (
    !["preflight-passed", "preflight-failed"].includes(
      report.qa.fieldQaStatus,
    )
  ) {
    throw new Error("Field QA report has an invalid status");
  }
  if (!report.source.manifestVerifiedAtExecution) {
    throw new Error("Source scene manifest was not verified at execution");
  }
  if (
    report.scope.boundaryGeometryUsed
    || report.scope.districtStatisticsCreated
    || report.publication.productPublished
    || report.publication.observationsCreated
    || report.publication.rasterAssetsCreated
  ) {
    throw new Error("Dry run unexpectedly created a publishable artifact");
  }
  if (
    report.publication.status
    !== "blocked-boundary-and-exhaustive-qa-pending"
  ) {
    throw new Error(
      "Preflight must remain blocked on canonical boundary and exhaustive QA",
    );
  }
}
