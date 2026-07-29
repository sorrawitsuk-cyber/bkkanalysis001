import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
const REQUIRE_APPROVED = process.argv.includes("--require-approved");

const [authorizationRaw, registryRaw, boundaryReportRaw] = await Promise.all([
  readFile(AUTHORIZATION_PATH, "utf8"),
  readFile(REGISTRY_PATH, "utf8"),
  readFile(BOUNDARY_REPORT_PATH, "utf8"),
]);
const authorization = JSON.parse(authorizationRaw);
const result = evaluateBoundaryAuthorization(authorization, {
  registry: JSON.parse(registryRaw),
  boundaryReport: JSON.parse(boundaryReportRaw),
});

console.log(
  JSON.stringify(
    {
      schemaVersion: authorization.schemaVersion,
      authorizationId: authorization.authorizationId,
      datasetId: authorization.source?.datasetId,
      decisionStatus: result.decisionStatus,
      validContract: result.validContract,
      gateOpen: result.gateOpen,
      contractErrors: result.contractErrors,
      approvalErrors: result.approvalErrors,
      blockers: result.blockers,
      promotionAllowed: result.gateOpen,
    },
    null,
    2,
  ),
);

if (!result.validContract) {
  process.exit(1);
}
if (REQUIRE_APPROVED && !result.gateOpen) {
  console.error(
    "Boundary promotion is blocked until approved written authorization passes every required permission check.",
  );
  process.exit(2);
}
