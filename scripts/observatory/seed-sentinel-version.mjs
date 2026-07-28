import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REGISTRY_PATH = resolve(ROOT, "config/observatory/registry.json");
const REPORT_PATH = resolve(
  ROOT,
  "reports/observatory/sentinel-2-source-intake.json",
);
const APPLY = process.argv.includes("--apply");

dotenv.config({ path: resolve(ROOT, ".env.local"), quiet: true });

const [registryRaw, reportRaw] = await Promise.all([
  readFile(REGISTRY_PATH, "utf8"),
  readFile(REPORT_PATH, "utf8"),
]);
const registry = JSON.parse(registryRaw);
const report = JSON.parse(reportRaw);
const dataset = registry.datasets.find(
  (item) => item.id === report.datasetId,
);

if (!dataset) {
  throw new Error(`Unknown dataset ${report.datasetId}`);
}
if (dataset.acceptance.status !== "validated") {
  throw new Error(`${report.datasetId} is not validated in the registry`);
}
if (report.registryVersion !== registry.registryVersion) {
  throw new Error(
    `Report registry ${report.registryVersion} does not match ${registry.registryVersion}`,
  );
}
if (report.acceptance.status !== "validated") {
  throw new Error(
    `Source intake is ${report.acceptance.status}: ${report.acceptance.blockers.join("; ")}`,
  );
}
if (
  report.acceptance.boundaryGeometryUsed
  || report.acceptance.observationsCreated
  || report.acceptance.rasterAssetsCreated
) {
  throw new Error("Source intake unexpectedly created a derived product");
}

const row = {
  dataset_id: report.datasetId,
  version_label: report.version.versionLabel,
  checksum_sha256: report.version.manifestChecksumSha256,
  retrieved_at: report.inspectedAt,
  observation_start: report.version.observationStart,
  observation_end: report.version.observationEnd,
  schema_version: report.version.schemaVersion,
  source_snapshot_uri: report.version.sourceSnapshotUri,
  acceptance_status: report.acceptance.datasetVersionStatus,
  acceptance_checked_at: report.inspectedAt,
  notes:
    `Validated Earth Engine scene manifest for Bangkok research envelope. ` +
    `${report.contract.attributionTemplate}. No district geometry or NDVI result included.`,
};

if (!APPLY) {
  console.log(
    JSON.stringify({
      mode: "plan",
      datasetId: row.dataset_id,
      versionLabel: row.version_label,
      checksumSha256: row.checksum_sha256,
      acceptanceStatus: row.acceptance_status,
      writes: 0,
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
const { data, error } = await supabase
  .from("observatory_dataset_versions")
  .upsert(row, {
    onConflict: "dataset_id,version_label,checksum_sha256",
  })
  .select(
    "dataset_version_id,dataset_id,version_label,checksum_sha256,acceptance_status",
  )
  .single();

if (error) {
  throw new Error(`observatory_dataset_versions: ${error.message}`);
}
if (
  data.dataset_id !== row.dataset_id
  || data.version_label !== row.version_label
  || data.checksum_sha256 !== row.checksum_sha256
  || data.acceptance_status !== row.acceptance_status
) {
  throw new Error("Seeded dataset version does not match the intake report");
}

console.log(
  JSON.stringify({
    mode: "apply",
    result: "dataset-version-synced",
    datasetVersionId: data.dataset_version_id,
    datasetId: data.dataset_id,
    versionLabel: data.version_label,
    acceptanceStatus: data.acceptance_status,
    districtAreasWritten: 0,
    observationsWritten: 0,
    rasterAssetsWritten: 0,
  }),
);
