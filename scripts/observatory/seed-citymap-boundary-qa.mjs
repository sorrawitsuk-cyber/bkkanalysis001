import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REGISTRY_PATH = resolve(ROOT, "config/observatory/registry.json");
const CITYMAP_INTAKE_PATH = resolve(
  ROOT,
  "reports/observatory/bma-citymap-service-intake.json",
);
const BOUNDARY_QA_PATH = resolve(
  ROOT,
  "reports/observatory/bma-citymap-boundary-qa.json",
);
const APPLY = process.argv.includes("--apply");

dotenv.config({ path: resolve(ROOT, ".env.local"), quiet: true });

const [registryRaw, cityMapIntakeRaw, boundaryQaRaw] =
  await Promise.all([
    readFile(REGISTRY_PATH, "utf8"),
    readFile(CITYMAP_INTAKE_PATH, "utf8"),
    readFile(BOUNDARY_QA_PATH, "utf8"),
  ]);
const registry = JSON.parse(registryRaw);
const cityMapIntake = JSON.parse(cityMapIntakeRaw);
const boundaryQa = JSON.parse(boundaryQaRaw);

if (
  cityMapIntake.registryVersion !== registry.registryVersion
  || boundaryQa.registryVersion !== registry.registryVersion
) {
  throw new Error("CityMap evidence does not match the registry version");
}
if (
  boundaryQa.serviceVersion.versionLabel
    !== cityMapIntake.version.versionLabel
  || boundaryQa.serviceVersion.manifestChecksumSha256
    !== cityMapIntake.version.manifestChecksumSha256
) {
  throw new Error("Boundary QA does not match the CityMap service version");
}
if (
  boundaryQa.qa.status !== "passed-technical-qa"
  || !boundaryQa.acceptance.internalProcessingAccepted
  || boundaryQa.acceptance.canonicalPublicBoundary
  || boundaryQa.acceptance.publicGeometryCreated
  || boundaryQa.source.sourceResponsePersisted
  || boundaryQa.source.geometryPersisted
) {
  throw new Error(
    "Boundary QA is not a passed, non-public internal-processing result",
  );
}

const plan = {
  mode: APPLY ? "apply" : "plan",
  datasetId: boundaryQa.datasetId,
  versionLabel: boundaryQa.serviceVersion.versionLabel,
  evidenceType: "boundary-technical-qa",
  methodVersion: boundaryQa.qaMethodVersion,
  evidenceStatus: "passed",
  evidenceScope: "internal-processing",
  resultChecksumSha256: boundaryQa.qa.resultChecksumSha256,
  geometryRowsWritten: 0,
  publicRowsCreated: 0,
};

if (!APPLY) {
  console.log(JSON.stringify({ ...plan, writes: 0 }, null, 2));
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
const { data: version, error: versionError } = await supabase
  .from("observatory_dataset_versions")
  .select(
    "dataset_version_id,dataset_id,version_label,checksum_sha256,acceptance_status",
  )
  .eq("dataset_id", boundaryQa.datasetId)
  .eq("version_label", boundaryQa.serviceVersion.versionLabel)
  .eq(
    "checksum_sha256",
    boundaryQa.serviceVersion.manifestChecksumSha256,
  )
  .single();

if (versionError) {
  throw new Error(
    `observatory_dataset_versions: ${versionError.message}`,
  );
}
if (version.acceptance_status !== "research") {
  throw new Error("CityMap service version must remain research-only");
}

const row = {
  dataset_version_id: version.dataset_version_id,
  evidence_type: plan.evidenceType,
  method_version: plan.methodVersion,
  report_schema_version: boundaryQa.reportSchemaVersion,
  result_checksum_sha256: plan.resultChecksumSha256,
  source_response_checksum_sha256:
    boundaryQa.source.responseChecksumSha256,
  evidence_status: plan.evidenceStatus,
  evidence_scope: plan.evidenceScope,
  summary: {
    featureCount: boundaryQa.qa.featureCount,
    invalidGeometryCount:
      boundaryQa.qa.invalidDistrictCodes.length,
    completeOfficialCodeSet:
      boundaryQa.qa.completeOfficialCodeSet,
    thaiNameMatchRatio: boundaryQa.qa.thaiNameMatchRatio,
    surveyYearsBuddhist: boundaryQa.qa.surveyYearsBuddhist,
    bounds: boundaryQa.qa.bounds,
    overlapAreaRatio: boundaryQa.qa.overlapAreaRatio,
    maxRelativeDeltaToAreaCal:
      boundaryQa.qa.maxRelativeDeltaToAreaCal,
    geometryPersisted: false,
    canonicalPublicBoundary: false,
  },
};
const { data, error } = await supabase
  .from("observatory_dataset_version_evidence")
  .upsert(row, {
    onConflict:
      "dataset_version_id,evidence_type,method_version,result_checksum_sha256",
  })
  .select(
    "evidence_id,dataset_version_id,evidence_type,method_version,evidence_status,evidence_scope,result_checksum_sha256",
  )
  .single();

if (error) {
  throw new Error(
    `observatory_dataset_version_evidence: ${error.message}`,
  );
}
if (
  data.dataset_version_id !== version.dataset_version_id
  || data.result_checksum_sha256 !== plan.resultChecksumSha256
  || data.evidence_status !== "passed"
  || data.evidence_scope !== "internal-processing"
) {
  throw new Error("Stored boundary QA evidence does not match the report");
}

console.log(
  JSON.stringify(
    {
      ...plan,
      result: "citymap-boundary-qa-synced",
      datasetVersionId: version.dataset_version_id,
      evidenceId: data.evidence_id,
    },
    null,
    2,
  ),
);
