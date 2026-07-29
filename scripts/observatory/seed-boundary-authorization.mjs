import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { evaluateBoundaryAuthorization } from "./lib/boundary-authorization.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const AUTHORIZATION_PATH = resolve(
  ROOT,
  "config/observatory/authorizations/bma-district-boundaries.json",
);
const REGISTRY_PATH = resolve(ROOT, "config/observatory/registry.json");
const BOUNDARY_REPORT_PATH = resolve(
  ROOT,
  "reports/observatory/bma-boundary-intake.json",
);
const APPLY = process.argv.includes("--apply");

dotenv.config({ path: resolve(ROOT, ".env.local"), quiet: true });

const [authorizationRaw, registryRaw, boundaryReportRaw] = await Promise.all([
  readFile(AUTHORIZATION_PATH, "utf8"),
  readFile(REGISTRY_PATH, "utf8"),
  readFile(BOUNDARY_REPORT_PATH, "utf8"),
]);
const authorization = JSON.parse(authorizationRaw);
const registry = JSON.parse(registryRaw);
const boundaryReport = JSON.parse(boundaryReportRaw);
const evaluation = evaluateBoundaryAuthorization(authorization, {
  registry,
  boundaryReport,
});

if (!evaluation.validContract) {
  throw new Error(
    `Authorization contract is invalid: ${evaluation.contractErrors.join("; ")}`,
  );
}

const row = {
  authorization_id: authorization.authorizationId,
  dataset_id: authorization.source.datasetId,
  evidence_schema_version: authorization.schemaVersion,
  resource_id: authorization.source.resourceId,
  source_url: authorization.source.url,
  source_checksum_sha256: authorization.source.checksumSha256,
  decision_status: authorization.decisionStatus,
  gate_status: authorization.gateStatus,
  authority: authorization.authority,
  request_metadata: authorization.request,
  evidence: authorization.evidence,
  permissions: authorization.permissions,
  terms: authorization.terms,
  blockers: authorization.blockers,
  ...(APPLY ? { updated_at: new Date().toISOString() } : {}),
};

if (!APPLY) {
  console.log(
    JSON.stringify(
      {
        mode: "plan",
        authorizationId: row.authorization_id,
        datasetId: row.dataset_id,
        decisionStatus: row.decision_status,
        gateStatus: row.gate_status,
        promotionAllowed: evaluation.gateOpen,
        writes: 0,
      },
      null,
      2,
    ),
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
  .from("observatory_dataset_authorizations")
  .upsert(row, { onConflict: "authorization_id" })
  .select(
    "authorization_id,dataset_id,source_checksum_sha256,decision_status,gate_status",
  )
  .single();

if (error) {
  throw new Error(`observatory_dataset_authorizations: ${error.message}`);
}
if (
  data.authorization_id !== row.authorization_id
  || data.dataset_id !== row.dataset_id
  || data.source_checksum_sha256 !== row.source_checksum_sha256
  || data.decision_status !== row.decision_status
  || data.gate_status !== row.gate_status
) {
  throw new Error("Stored authorization does not match the reviewed record");
}

console.log(
  JSON.stringify(
    {
      mode: "apply",
      result: "boundary-authorization-synced",
      authorizationId: data.authorization_id,
      datasetId: data.dataset_id,
      decisionStatus: data.decision_status,
      gateStatus: data.gate_status,
      promotionAllowed: evaluation.gateOpen,
      publicRowsCreated: 0,
      districtAreasWritten: 0,
    },
    null,
    2,
  ),
);
