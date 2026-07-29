import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateBoundaryAuthorization } from "./lib/boundary-authorization.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const [
  registryRaw,
  areasRaw,
  boundaryReportRaw,
  sentinelReportRaw,
  ndviFieldQaRaw,
  exhaustiveConfigRaw,
  exhaustivePlanRaw,
  exhaustiveQaRaw,
  catalogSource,
  observationsSource,
  migrationSource,
  tileMigrationSource,
  boundaryAuthorizationRaw,
  authorizationMigrationSource,
  authorizationRequestSource,
  cityMapReportRaw,
  authorizationWithdrawnMigrationSource,
  cityMapBoundaryConfigRaw,
  cityMapBoundaryQaRaw,
  datasetVersionEvidenceMigrationSource,
  evidenceResultChecksumMigrationSource,
  researchObservationMigrationSource,
  researchPipelineSource,
  researchStoreSource,
  observatoryWorkspaceSource,
  observatoryMapSource,
  cityMapRuntimeSource,
] =
  await Promise.all([
    readFile(resolve(ROOT, "config/observatory/registry.json"), "utf8"),
    readFile(
      resolve(ROOT, "src/data/observatory/bkk-districts.provisional.json"),
      "utf8",
    ),
    readFile(
      resolve(ROOT, "reports/observatory/bma-boundary-intake.json"),
      "utf8",
    ),
    readFile(
      resolve(ROOT, "reports/observatory/sentinel-2-source-intake.json"),
      "utf8",
    ),
    readFile(
      resolve(ROOT, "reports/observatory/ndvi-2025-field-qa.json"),
      "utf8",
    ),
    readFile(
      resolve(
        ROOT,
        "config/observatory/qa/ndvi-exhaustive-coverage-v1.0.0.json",
      ),
      "utf8",
    ),
    readFile(
      resolve(ROOT, "reports/observatory/ndvi-2025-exhaustive-plan.json"),
      "utf8",
    ),
    readFile(
      resolve(ROOT, "reports/observatory/ndvi-2025-exhaustive-qa.json"),
      "utf8",
    ),
    readFile(resolve(ROOT, "src/lib/observatory/catalog.ts"), "utf8"),
    readFile(resolve(ROOT, "src/app/api/v1/observations/route.ts"), "utf8"),
    readFile(
      resolve(
        ROOT,
        "supabase/migrations/20260728023000_observatory_v2_core.sql",
      ),
      "utf8",
    ),
    readFile(
      resolve(
        ROOT,
        "supabase/migrations/20260729013000_observatory_processing_tiles.sql",
      ),
      "utf8",
    ),
    readFile(
      resolve(
        ROOT,
        "config/observatory/authorizations/bma-district-boundaries.json",
      ),
      "utf8",
    ),
    readFile(
      resolve(
        ROOT,
        "supabase/migrations/20260729043000_observatory_dataset_authorizations.sql",
      ),
      "utf8",
    ),
    readFile(
      resolve(
        ROOT,
        "docs/requests/bma-district-boundary-reuse-request.md",
      ),
      "utf8",
    ),
    readFile(
      resolve(
        ROOT,
        "reports/observatory/bma-citymap-service-intake.json",
      ),
      "utf8",
    ),
    readFile(
      resolve(
        ROOT,
        "supabase/migrations/20260729070000_observatory_authorization_withdrawn_status.sql",
      ),
      "utf8",
    ),
    readFile(
      resolve(
        ROOT,
        "config/observatory/qa/citymap-district-boundary-v1.0.0.json",
      ),
      "utf8",
    ),
    readFile(
      resolve(
        ROOT,
        "reports/observatory/bma-citymap-boundary-qa.json",
      ),
      "utf8",
    ),
    readFile(
      resolve(
        ROOT,
        "supabase/migrations/20260729093000_observatory_dataset_version_evidence.sql",
      ),
      "utf8",
    ),
    readFile(
      resolve(
        ROOT,
        "supabase/migrations/20260729094500_observatory_dataset_version_evidence_result_checksum.sql",
      ),
      "utf8",
    ),
    readFile(
      resolve(
        ROOT,
        "supabase/migrations/20260729113000_observatory_research_observations.sql",
      ),
      "utf8",
    ),
    readFile(
      resolve(
        ROOT,
        "scripts/observatory/run-ndvi-district-research.mjs",
      ),
      "utf8",
    ),
    readFile(
      resolve(
        ROOT,
        "src/lib/supabase/observatory-research.ts",
      ),
      "utf8",
    ),
    readFile(
      resolve(
        ROOT,
        "src/components/observatory/ObservatoryWorkspace.tsx",
      ),
      "utf8",
    ),
    readFile(
      resolve(ROOT, "src/components/observatory/ObservatoryMap.tsx"),
      "utf8",
    ),
    readFile(
      resolve(ROOT, "src/lib/observatory/citymap.ts"),
      "utf8",
    ),
  ]);

const registry = JSON.parse(registryRaw);
const areas = JSON.parse(areasRaw);
const boundaryReport = JSON.parse(boundaryReportRaw);
const sentinelReport = JSON.parse(sentinelReportRaw);
const ndviFieldQa = JSON.parse(ndviFieldQaRaw);
const exhaustiveConfig = JSON.parse(exhaustiveConfigRaw);
const exhaustivePlan = JSON.parse(exhaustivePlanRaw);
const exhaustiveQa = JSON.parse(exhaustiveQaRaw);
const boundaryAuthorization = JSON.parse(boundaryAuthorizationRaw);
const cityMapReport = JSON.parse(cityMapReportRaw);
const cityMapBoundaryConfig = JSON.parse(cityMapBoundaryConfigRaw);
const cityMapBoundaryQa = JSON.parse(cityMapBoundaryQaRaw);

assert.equal(areas.type, "FeatureCollection");
assert.equal(areas.features.length, 50);

assert.equal(
  boundaryReport.reportSchemaVersion,
  "observatory-boundary-intake/v2",
);
assert.equal(boundaryReport.datasetId, "bma-district-boundaries");
assert.equal(boundaryReport.resourceId, "bma-district-gml");
assert.equal(boundaryReport.source.mode, "remote");
assert.equal(boundaryReport.source.httpStatus, 200);
assert.match(boundaryReport.source.checksumSha256, /^[a-f0-9]{64}$/);
assert.equal(boundaryReport.source.sourcePersisted, false);
assert.equal(boundaryReport.schemaInspection.featureMemberCount, 50);
assert.equal(boundaryReport.schemaInspection.parsedFeatureCount, 50);
assert.equal(boundaryReport.geometryQa.status, "passed");
assert.equal(boundaryReport.geometryQa.uniqueDistrictCodeCount, 50);
assert.equal(boundaryReport.geometryQa.uniqueAreaCodeCount, 50);
assert.deepEqual(boundaryReport.geometryQa.invalidGeometryAreaCodes, []);
assert.equal(boundaryReport.geometryQa.boundsWithinBangkok, true);
assert.equal(boundaryReport.geometryQa.overlapAreaEstimateSquareMeters, 0);
assert.equal(boundaryReport.acceptance.status, "blocked");
assert.equal(boundaryReport.acceptance.geometryAccepted, true);
assert.equal(boundaryReport.acceptance.licenseAccepted, false);
assert.equal(boundaryReport.acceptance.promotedToRuntime, false);
assert.equal(boundaryReport.acceptance.seededToSupabase, false);

const officialBoundaryDataset = registry.datasets.find(
  (dataset) => dataset.id === "bma-district-boundaries",
);
const officialBoundaryResourceIds = new Set(
  officialBoundaryDataset.resources.map((resource) => resource.id),
);
assert.ok(officialBoundaryResourceIds.has("bma-district-shapefile"));
assert.ok(officialBoundaryResourceIds.has("bma-district-gml"));
assert.equal(officialBoundaryDataset.license.status, "unverified");
assert.equal(officialBoundaryDataset.license.redistribution, "pending");

assert.equal(
  boundaryAuthorization.schemaVersion,
  "observatory-boundary-authorization/v1",
);
assert.equal(
  boundaryAuthorization.source.datasetId,
  boundaryReport.datasetId,
);
assert.equal(
  boundaryAuthorization.source.resourceId,
  boundaryReport.resourceId,
);
assert.equal(
  boundaryAuthorization.source.checksumSha256,
  boundaryReport.source.checksumSha256,
);
assert.equal(boundaryAuthorization.decisionStatus, "withdrawn");
assert.equal(boundaryAuthorization.gateStatus, "blocked");
assert.ok(boundaryAuthorization.blockers.length >= 1);
assert.ok(
  Object.values(boundaryAuthorization.permissions).every(
    (permission) => permission === null,
  ),
);
assert.equal(boundaryAuthorization.evidence.artifactReference, null);
assert.equal(boundaryAuthorization.evidence.artifactChecksumSha256, null);
const withdrawnAuthorizationEvaluation = evaluateBoundaryAuthorization(
  boundaryAuthorization,
  { registry, boundaryReport },
);
assert.equal(withdrawnAuthorizationEvaluation.validContract, true);
assert.equal(withdrawnAuthorizationEvaluation.gateOpen, false);

const approvedAuthorizationFixture = structuredClone(boundaryAuthorization);
approvedAuthorizationFixture.decisionStatus = "approved";
approvedAuthorizationFixture.gateStatus = "open";
approvedAuthorizationFixture.authority.responseSignerName = "Authorized officer";
approvedAuthorizationFixture.authority.responseSignerRole = "Data custodian";
approvedAuthorizationFixture.request.sentAt = "2026-07-29T08:00:00.000Z";
approvedAuthorizationFixture.request.externalReference = "BMA-REPLY-2026-001";
approvedAuthorizationFixture.evidence = {
  artifactReference: "restricted://bma-replies/BMA-REPLY-2026-001",
  artifactChecksumSha256:
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  issuedAt: "2026-07-29T09:00:00.000Z",
  receivedAt: "2026-07-29T09:01:00.000Z",
  verifiedAt: "2026-07-29T10:00:00.000Z",
  verifiedBy: "Observatory evidence reviewer",
};
approvedAuthorizationFixture.permissions = {
  useForAnalysis: true,
  transformGeometry: true,
  retainSourceSnapshotPrivately: true,
  redistributeSourceGeometry: false,
  redistributeDerivedGeometry: true,
  publishDerivedTiles: true,
  publishDistrictStatistics: true,
};
approvedAuthorizationFixture.terms = {
  licenseName: "Written BMA permission",
  termsUrl: null,
  attributionText: "Boundary data: Bangkok Metropolitan Administration",
  authoritativeVersionLabel: "BMA-50-districts-2026-07",
  updateCadence: "Confirm with BMA before each annual refresh",
};
approvedAuthorizationFixture.blockers = [];

const approvedRegistryFixture = structuredClone(registry);
const approvedBoundaryDataset = approvedRegistryFixture.datasets.find(
  (dataset) => dataset.id === "bma-district-boundaries",
);
approvedBoundaryDataset.license.status = "verified";
approvedBoundaryDataset.license.redistribution = "allowed";
approvedBoundaryDataset.license.attributionTemplate =
  approvedAuthorizationFixture.terms.attributionText;
approvedBoundaryDataset.acceptance.status = "validated";
approvedBoundaryDataset.acceptance.blockers = [];
const approvedAuthorizationEvaluation = evaluateBoundaryAuthorization(
  approvedAuthorizationFixture,
  { registry: approvedRegistryFixture, boundaryReport },
);
assert.equal(approvedAuthorizationEvaluation.validContract, true);
assert.equal(approvedAuthorizationEvaluation.gateOpen, true);

const deniedPublicationFixture = structuredClone(
  approvedAuthorizationFixture,
);
deniedPublicationFixture.permissions.publishDistrictStatistics = false;
const deniedPublicationEvaluation = evaluateBoundaryAuthorization(
  deniedPublicationFixture,
  { registry: approvedRegistryFixture, boundaryReport },
);
assert.equal(deniedPublicationEvaluation.validContract, false);
assert.equal(deniedPublicationEvaluation.gateOpen, false);
assert.ok(
  deniedPublicationEvaluation.approvalErrors.includes(
    "permissions.publishDistrictStatistics must be true",
  ),
);
assert.ok(
  deniedPublicationEvaluation.contractErrors.includes(
    "registry dataset cannot be validated while authorization gate is closed",
  ),
);
assert.match(
  authorizationRequestSource,
  /License not specified/,
);
assert.match(
  authorizationRequestSource,
  new RegExp(boundaryReport.source.checksumSha256),
);
assert.match(authorizationRequestSource, /ห้ามส่ง/);

const cityMapDataset = registry.datasets.find(
  (dataset) => dataset.id === "bma-citymap-basemap",
);
assert.equal(cityMapDataset.owner, "กรุงเทพมหานคร");
assert.equal(cityMapDataset.acceptance.status, "research");
assert.equal(cityMapDataset.license.status, "unverified");
assert.equal(cityMapDataset.license.redistribution, "restricted");
assert.equal(
  cityMapReport.reportSchemaVersion,
  "observatory-public-map-service-intake/v1",
);
assert.equal(cityMapReport.registryVersion, registry.registryVersion);
assert.equal(cityMapReport.datasetId, cityMapDataset.id);
assert.equal(cityMapReport.service.mapName, "Basemap1000_4326_H");
assert.equal(cityMapReport.service.spatialReference, "EPSG:4326");
assert.equal(cityMapReport.service.layerCount, 15);
assert.equal(cityMapReport.service.singleFusedMapCache, false);
assert.equal(cityMapReport.wms.version, "1.3.0");
assert.ok(cityMapReport.wms.supportedCrs.includes("EPSG:4326"));
assert.equal(cityMapReport.wms.getMapSmokeStatus, 200);
assert.equal(cityMapReport.wms.getMapContentType, "image/png");
assert.equal(cityMapReport.districtLayer.id, 13);
assert.equal(cityMapReport.districtLayer.recordCount, 50);
assert.equal(cityMapReport.districtLayer.completeOfficialCodeSet, true);
assert.deepEqual(cityMapReport.districtLayer.surveyYearsBuddhist, [2561]);
assert.equal(cityMapReport.districtLayer.geometryQueried, false);
assert.equal(cityMapReport.districtLayer.geometryPersisted, false);
assert.match(
  cityMapReport.version.versionLabel,
  /^citymap-11\.5-district-y2561-[a-f0-9]{12}$/,
);
assert.match(
  cityMapReport.version.manifestChecksumSha256,
  /^[a-f0-9]{64}$/,
);
assert.equal(cityMapReport.version.acceptanceStatus, "research");
assert.equal(
  cityMapReport.consumptionPolicy.status,
  "accepted-for-direct-basemap",
);
assert.equal(
  cityMapReport.consumptionPolicy.directExternalRequestsOnly,
  true,
);
assert.equal(cityMapReport.consumptionPolicy.proxyEnabled, false);
assert.equal(
  cityMapReport.consumptionPolicy.analyticalGeometryAccepted,
  false,
);
assert.equal(
  cityMapReport.consumptionPolicy.sourceRepublicationAllowed,
  false,
);
assert.equal(
  cityMapDataset.evidence.serviceIntakeReportPath,
  "reports/observatory/bma-citymap-service-intake.json",
);
assert.equal(
  cityMapDataset.evidence.serviceIntakeStatus,
  cityMapReport.consumptionPolicy.status,
);
assert.equal(
  cityMapDataset.evidence.boundaryQaReportPath,
  "reports/observatory/bma-citymap-boundary-qa.json",
);
assert.equal(
  cityMapDataset.evidence.boundaryQaMethodVersion,
  "citymap-district-boundary-qa-v1.0.0",
);
assert.equal(
  cityMapDataset.evidence.boundaryQaStatus,
  "passed-technical-qa",
);

assert.equal(
  cityMapBoundaryConfig.schemaVersion,
  "observatory-boundary-qa-config/v1",
);
assert.equal(
  cityMapBoundaryConfig.qaMethodVersion,
  cityMapDataset.evidence.boundaryQaMethodVersion,
);
assert.equal(cityMapBoundaryConfig.datasetId, cityMapDataset.id);
assert.equal(cityMapBoundaryConfig.serviceLayerId, 13);
assert.equal(cityMapBoundaryConfig.expected.featureCount, 50);
assert.equal(cityMapBoundaryConfig.expected.districtCodeStart, 1001);
assert.equal(cityMapBoundaryConfig.expected.districtCodeEnd, 1050);
assert.deepEqual(
  cityMapBoundaryConfig.expected.surveyYearsBuddhist,
  [2561],
);
assert.equal(
  cityMapBoundaryConfig.expected.spatialReference,
  "EPSG:4326",
);
assert.equal(
  cityMapBoundaryConfig.areaSemantics.geometryComparisonField,
  "AREA_CAL",
);
assert.equal(
  cityMapBoundaryConfig.areaSemantics.reportedAdministrativeAreaField,
  "AREA_BMA",
);
assert.equal(cityMapBoundaryConfig.persistence.persistSourceResponse, false);
assert.equal(cityMapBoundaryConfig.persistence.persistGeometry, false);
assert.equal(cityMapBoundaryConfig.persistence.publishGeometry, false);
assert.equal(
  cityMapBoundaryConfig.persistence.persistAggregateQaReport,
  true,
);

assert.equal(
  cityMapBoundaryQa.reportSchemaVersion,
  "observatory-boundary-qa/v1",
);
assert.equal(cityMapBoundaryQa.registryVersion, registry.registryVersion);
assert.equal(cityMapBoundaryQa.datasetId, cityMapDataset.id);
assert.equal(
  cityMapBoundaryQa.qaMethodVersion,
  cityMapBoundaryConfig.qaMethodVersion,
);
assert.equal(
  cityMapBoundaryQa.serviceVersion.versionLabel,
  cityMapReport.version.versionLabel,
);
assert.equal(
  cityMapBoundaryQa.serviceVersion.manifestChecksumSha256,
  cityMapReport.version.manifestChecksumSha256,
);
assert.match(cityMapBoundaryQa.config.checksumSha256, /^[a-f0-9]{64}$/);
assert.equal(cityMapBoundaryQa.source.layerId, 13);
assert.equal(cityMapBoundaryQa.source.httpStatus, 200);
assert.match(
  cityMapBoundaryQa.source.responseChecksumSha256,
  /^[a-f0-9]{64}$/,
);
assert.equal(cityMapBoundaryQa.source.geometryRequested, true);
assert.equal(cityMapBoundaryQa.source.sourceResponsePersisted, false);
assert.equal(cityMapBoundaryQa.source.geometryPersisted, false);
assert.equal(cityMapBoundaryQa.qa.status, "passed-technical-qa");
assert.equal(
  cityMapBoundaryQa.qa.resultChecksumSha256,
  cityMapDataset.evidence.boundaryQaResultChecksumSha256,
);
assert.equal(cityMapBoundaryQa.qa.featureCount, 50);
assert.equal(cityMapBoundaryQa.qa.completeOfficialCodeSet, true);
assert.equal(cityMapBoundaryQa.qa.uniqueDistrictCodeCount, 50);
assert.equal(cityMapBoundaryQa.qa.uniqueThaiNameCount, 50);
assert.equal(cityMapBoundaryQa.qa.thaiNameMatchRatio, 1);
assert.deepEqual(cityMapBoundaryQa.qa.surveyYearsBuddhist, [2561]);
assert.deepEqual(cityMapBoundaryQa.qa.invalidDistrictCodes, []);
assert.equal(cityMapBoundaryQa.qa.boundsWithinEnvelope, true);
assert.ok(
  cityMapBoundaryQa.qa.overlapAreaRatio
    <= cityMapBoundaryConfig.thresholds.maxOverlapAreaRatio,
);
assert.ok(
  cityMapBoundaryQa.qa.maxRelativeDeltaToAreaCal
    <= cityMapBoundaryConfig.thresholds.maxRelativeDeltaToAreaCal,
);
assert.deepEqual(cityMapBoundaryQa.qa.blockers, []);
assert.equal(cityMapBoundaryQa.perDistrict.length, 50);
assert.ok(
  cityMapBoundaryQa.perDistrict.every(
    (district) =>
      district.geometryValid === true
      && district.thaiNameMatchesApplication === true
      && Number.isFinite(district.geodesicAreaSquareMeters)
      && Number.isFinite(district.areaCalSquareKilometers)
      && Number.isFinite(district.areaBmaSquareKilometers),
  ),
);
assert.equal(
  cityMapBoundaryQa.areaSemantics.geometryGateField,
  "AREA_CAL",
);
assert.equal(
  cityMapBoundaryQa.areaSemantics.administrativeContextField,
  "AREA_BMA",
);
assert.equal(
  cityMapBoundaryQa.priorOfficialSnapshotComparison.sourceChecksumSha256,
  boundaryReport.source.checksumSha256,
);
assert.ok(
  cityMapBoundaryQa.priorOfficialSnapshotComparison.relativeTotalAreaDelta
    < 0.01,
);
assert.equal(
  cityMapBoundaryQa.acceptance.status,
  "accepted-for-internal-processing",
);
assert.equal(
  cityMapBoundaryQa.acceptance.internalProcessingAccepted,
  true,
);
assert.equal(cityMapBoundaryQa.acceptance.canonicalPublicBoundary, false);
assert.equal(cityMapBoundaryQa.acceptance.publicGeometryCreated, false);
assert.equal(cityMapBoundaryQa.acceptance.sourceGeometryPublished, false);
assert.equal(cityMapBoundaryQa.acceptance.supabaseAreaRowsCreated, false);
assert.deepEqual(cityMapBoundaryQa.acceptance.blockers, []);
assert.match(observatoryMapSource, /L\.tileLayer\.wms/);
assert.match(observatoryMapSource, /crs: L\.CRS\.EPSG4326/);
assert.doesNotMatch(observatoryMapSource, /cartocdn|OpenStreetMap/);
assert.match(cityMapRuntimeSource, /Basemap1000_4326_H/);
assert.match(cityMapRuntimeSource, /Bangkok CityMap/);

const sentinelDataset = registry.datasets.find(
  (dataset) => dataset.id === "sentinel-2-l2a",
);
assert.equal(sentinelDataset.license.status, "verified");
assert.equal(sentinelDataset.license.redistribution, "allowed");
assert.match(
  sentinelDataset.license.attributionTemplate,
  /^Contains modified Copernicus Sentinel data /,
);
assert.equal(sentinelDataset.acceptance.status, "validated");
assert.deepEqual(sentinelDataset.acceptance.blockers, []);

assert.equal(
  sentinelReport.reportSchemaVersion,
  "observatory-source-intake/v1",
);
assert.equal(sentinelReport.datasetId, "sentinel-2-l2a");
assert.equal(sentinelReport.source.collectionAssetType, "ImageCollection");
assert.equal(sentinelReport.acceptance.status, "validated");
assert.equal(sentinelReport.acceptance.datasetVersionStatus, "validated");
assert.deepEqual(sentinelReport.acceptance.blockers, []);
assert.equal(sentinelReport.acceptance.boundaryGeometryUsed, false);
assert.equal(sentinelReport.acceptance.observationsCreated, false);
assert.equal(sentinelReport.acceptance.rasterAssetsCreated, false);
assert.ok(sentinelReport.inventory.sceneCount >= 1);
assert.equal(
  sentinelReport.version.sceneManifest.sceneIds.length,
  sentinelReport.inventory.sceneCount,
);
assert.equal(
  sentinelReport.version.sceneManifest.sensingTimes.length,
  sentinelReport.inventory.sceneCount,
);
assert.match(
  sentinelReport.version.manifestChecksumSha256,
  /^[a-f0-9]{64}$/,
);
assert.ok(
  Object.values(sentinelReport.inventory.seasonSceneCounts).every(
    (count) => count >= 3,
  ),
);

const vegetationProduct = registry.products.find(
  (product) => product.id === "vegetation",
);
assert.ok(vegetationProduct.sourceDatasetIds.includes("sentinel-2-l2a"));
assert.ok(
  vegetationProduct.sourceDatasetIds.includes("bma-district-boundaries"),
);
assert.ok(
  vegetationProduct.sourceDatasetIds.includes("bma-citymap-basemap"),
);
assert.equal(vegetationProduct.publishGate.status, "acceptance");
assert.equal(vegetationProduct.evidence.fieldQaStatus, "preflight-passed");

assert.equal(ndviFieldQa.reportSchemaVersion, "observatory-field-qa/v1");
assert.equal(ndviFieldQa.productId, "vegetation");
assert.equal(ndviFieldQa.methodVersion, "ndvi-seasonal-v1.0.0");
assert.equal(ndviFieldQa.source.manifestVerifiedAtExecution, true);
assert.equal(
  ndviFieldQa.source.manifestChecksumSha256,
  sentinelReport.version.manifestChecksumSha256,
);
assert.equal(ndviFieldQa.scope.type, "research-envelope");
assert.equal(ndviFieldQa.scope.boundaryGeometryUsed, false);
assert.equal(ndviFieldQa.scope.districtStatisticsCreated, false);
assert.equal(ndviFieldQa.qa.fieldQaStatus, "preflight-passed");
assert.deepEqual(ndviFieldQa.qa.blockers, []);
assert.match(ndviFieldQa.qa.resultChecksumSha256, /^[a-f0-9]{64}$/);
assert.match(
  ndviFieldQa.processingRun.deterministicRunId,
  /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-8[a-f0-9]{3}-[a-f0-9]{12}$/,
);
assert.equal(ndviFieldQa.seasons.length, 3);
for (const season of ndviFieldQa.seasons) {
  assert.equal(season.requestedSampleSize, 5000);
  assert.equal(season.sampleCount, 5000);
  assert.ok(season.validSampleCount > 0);
  assert.ok(
    season.coverageConfidence95.lower
      >= vegetationProduct.publishGate.minValidCoverage,
  );
  assert.ok(
    season.sceneCount >= vegetationProduct.publishGate.minSceneCount,
  );
  assert.equal(season.qualityStatus, "preflight-accepted");
  assert.deepEqual(season.blockers, []);
}
assert.equal(
  ndviFieldQa.publication.status,
  "blocked-boundary-and-exhaustive-qa-pending",
);
assert.equal(ndviFieldQa.publication.productPublished, false);
assert.equal(ndviFieldQa.publication.observationsCreated, false);
assert.equal(ndviFieldQa.publication.rasterAssetsCreated, false);

assert.equal(
  exhaustiveConfig.schemaVersion,
  "observatory-tiled-qa/v1",
);
assert.equal(
  exhaustiveConfig.qaMethodVersion,
  "ndvi-exhaustive-coverage-v1.0.0",
);
assert.equal(exhaustiveConfig.processing.analysisScaleMeters, 10);
assert.equal(exhaustiveConfig.processing.analysisCrs, "EPSG:32647");
assert.equal(exhaustiveConfig.retry.maxAttempts, 3);
assert.equal(exhaustiveConfig.publication.allowsPublicProduct, false);
assert.equal(exhaustiveConfig.publication.allowsObservations, false);
assert.equal(exhaustiveConfig.publication.allowsRasterAssets, false);

assert.equal(
  exhaustivePlan.reportSchemaVersion,
  "observatory-exhaustive-plan/v1",
);
assert.equal(exhaustivePlan.summary.tileCount, 16);
assert.equal(exhaustivePlan.summary.seasonCount, 3);
assert.equal(exhaustivePlan.summary.jobCount, 48);
assert.equal(exhaustivePlan.sourceDatasetId, "sentinel-2-l2a");
assert.equal(
  exhaustivePlan.summary.jobCount,
  exhaustivePlan.summary.expectedJobCount,
);
assert.equal(exhaustivePlan.tiles.length, 16);
assert.equal(exhaustivePlan.jobs.length, 48);
assert.match(exhaustivePlan.planChecksumSha256, /^[a-f0-9]{64}$/);
assert.match(
  exhaustivePlan.processingRunId,
  /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-8[a-f0-9]{3}-[a-f0-9]{12}$/,
);
assert.equal(exhaustivePlan.publication.productPublished, false);
assert.equal(exhaustivePlan.publication.observationsCreated, false);
assert.equal(exhaustivePlan.publication.rasterAssetsCreated, false);

const tileIds = new Set(
  exhaustivePlan.tiles.map((tile) => tile.tileId),
);
const jobIds = new Set(exhaustivePlan.jobs.map((job) => job.jobId));
assert.equal(tileIds.size, 16);
assert.equal(jobIds.size, 48);
for (const job of exhaustivePlan.jobs) {
  assert.ok(tileIds.has(job.tileId));
  assert.ok(["hot", "wet", "cool"].includes(job.seasonId));
  assert.equal(job.bounds.length, 4);
  assert.ok(job.bounds[0] < job.bounds[2]);
  assert.ok(job.bounds[1] < job.bounds[3]);
  assert.equal(job.maxAttempts, 3);
}
assertTilesPartitionBounds(
  exhaustivePlan.tiles,
  sentinelReport.version.sceneManifest.query.bounds,
);

assert.equal(
  exhaustiveQa.reportSchemaVersion,
  "observatory-exhaustive-qa/v1",
);
assert.equal(
  exhaustiveQa.processingRun.processingRunId,
  exhaustivePlan.processingRunId,
);
assert.equal(exhaustiveQa.processingRun.status, "succeeded");
assert.equal(
  exhaustiveQa.source.manifestChecksumSha256,
  sentinelReport.version.manifestChecksumSha256,
);
assert.equal(
  exhaustiveQa.plan.planChecksumSha256,
  exhaustivePlan.planChecksumSha256,
);
assert.equal(exhaustiveQa.execution.succeededJobs, 48);
assert.equal(exhaustiveQa.execution.failedJobs, 0);
assert.equal(exhaustiveQa.execution.rejectedJobs, 0);
assert.equal(exhaustiveQa.execution.checksumVerifiedJobs, 48);
assert.equal(exhaustiveQa.execution.retryCount, 0);
assert.match(
  exhaustiveQa.execution.resultChecksumSha256,
  /^[a-f0-9]{64}$/,
);
assert.equal(exhaustiveQa.seasons.length, 3);
for (const season of exhaustiveQa.seasons) {
  assert.equal(season.succeededJobs, 16);
  assert.equal(season.failedJobs, 0);
  assert.ok(
    season.validCoverage
      >= vegetationProduct.publishGate.minValidCoverage,
  );
  assert.equal(season.qualityStatus, "accepted");
}
assert.equal(exhaustiveQa.qa.status, "passed-research-envelope");
assert.deepEqual(exhaustiveQa.qa.blockers, []);
assert.equal(exhaustiveQa.qa.exhaustiveCoverage, true);
assert.equal(exhaustiveQa.publication.productPublished, false);
assert.equal(exhaustiveQa.publication.observationsCreated, false);
assert.equal(exhaustiveQa.publication.rasterAssetsCreated, false);
assert.equal(
  vegetationProduct.evidence.exhaustiveQaStatus,
  "passed-research-envelope",
);

const allowedAreaProperties = [
  "areaCode",
  "legacyId",
  "level",
  "nameEn",
  "nameTh",
].sort();
const areaCodes = new Set();

for (const [index, feature] of areas.features.entries()) {
  assert.equal(feature.type, "Feature", `area feature ${index} type`);
  assert.ok(
    feature.geometry?.type === "Polygon"
      || feature.geometry?.type === "MultiPolygon",
    `area feature ${index} geometry`,
  );
  assert.deepEqual(
    Object.keys(feature.properties).sort(),
    allowedAreaProperties,
    `area feature ${index} public properties`,
  );
  assert.match(feature.properties.areaCode, /^BKK-D\d{2}$/);
  assert.equal(feature.properties.level, "district");
  assert.equal(typeof feature.properties.nameTh, "string");
  assert.equal(typeof feature.properties.nameEn, "string");
  assert.ok(!areaCodes.has(feature.properties.areaCode), "duplicate area code");
  areaCodes.add(feature.properties.areaCode);
}

const lensCatalogSource = catalogSource.split(
  "export type DatasetReadiness",
)[0];
const lensIds = [
  ...lensCatalogSource.matchAll(/^\s{4}id:\s*"([^"]+)",$/gm),
].map((match) => match[1]);
const productIds = registry.products.map((product) => product.id);

assert.deepEqual(
  [...productIds].sort(),
  [...lensIds].sort(),
  "UI lenses and registry products must stay aligned",
);

assert.match(
  observationsSource,
  /publicProductStatuses\.includes/,
  "observation API must enforce registry publication statuses",
);
assert.match(
  observationsSource,
  /status:\s*"unavailable"/,
  "observation API must support fail-closed unavailable responses",
);
assert.doesNotMatch(
  observationsSource,
  /Math\.random|seed_stats|generate_lst_data/,
  "observation API must not generate or seed fallback values",
);

assert.match(
  tileMigrationSource,
  /CREATE TABLE IF NOT EXISTS observatory_processing_tiles/,
);
assert.match(
  tileMigrationSource,
  /ALTER TABLE observatory_processing_tiles ENABLE ROW LEVEL SECURITY/,
);
assert.match(
  tileMigrationSource,
  /REVOKE ALL ON observatory_processing_tiles FROM anon, authenticated/,
);
assert.match(
  tileMigrationSource,
  /FOR UPDATE SKIP LOCKED/,
);
assert.match(
  tileMigrationSource,
  /SECURITY DEFINER/,
);
assert.match(
  tileMigrationSource,
  /TO service_role/,
);
assert.doesNotMatch(
  tileMigrationSource,
  /CREATE POLICY[\s\S]*observatory_processing_tiles/,
  "tile checkpoints must not have a public RLS policy",
);
assert.match(
  authorizationMigrationSource,
  /CREATE TABLE IF NOT EXISTS observatory_dataset_authorizations/,
);
assert.match(
  authorizationMigrationSource,
  /ALTER TABLE observatory_dataset_authorizations ENABLE ROW LEVEL SECURITY/,
);
assert.match(
  authorizationMigrationSource,
  /REVOKE ALL ON observatory_dataset_authorizations FROM anon, authenticated/,
);
assert.match(
  authorizationMigrationSource,
  /TO service_role/,
);
assert.doesNotMatch(
  authorizationMigrationSource,
  /CREATE POLICY[\s\S]*observatory_dataset_authorizations/,
  "authorization evidence must not have a public RLS policy",
);
assert.match(
  authorizationWithdrawnMigrationSource,
  /'withdrawn'/,
);
assert.match(
  authorizationWithdrawnMigrationSource,
  /gate remains blocked/,
);
assert.match(
  datasetVersionEvidenceMigrationSource,
  /CREATE TABLE IF NOT EXISTS observatory_dataset_version_evidence/,
);
assert.match(
  datasetVersionEvidenceMigrationSource,
  /ALTER TABLE observatory_dataset_version_evidence ENABLE ROW LEVEL SECURITY/,
);
assert.match(
  datasetVersionEvidenceMigrationSource,
  /REVOKE ALL ON observatory_dataset_version_evidence[\s\S]*FROM anon, authenticated/,
);
assert.match(
  datasetVersionEvidenceMigrationSource,
  /TO service_role/,
);
assert.doesNotMatch(
  datasetVersionEvidenceMigrationSource,
  /CREATE POLICY[\s\S]*observatory_dataset_version_evidence/,
  "dataset version evidence must not have a public RLS policy",
);
assert.match(
  evidenceResultChecksumMigrationSource,
  /RENAME COLUMN report_checksum_sha256 TO result_checksum_sha256/,
);
assert.match(
  evidenceResultChecksumMigrationSource,
  /Stable checksum of the QA method/,
);
for (const table of [
  "observatory_research_areas",
  "observatory_research_observations",
]) {
  assert.match(
    researchObservationMigrationSource,
    new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`),
  );
  assert.match(
    researchObservationMigrationSource,
    new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`),
  );
  assert.match(
    researchObservationMigrationSource,
    new RegExp(
      `REVOKE ALL ON ${table}[\\s\\S]*FROM anon, authenticated`,
    ),
  );
}
assert.match(researchObservationMigrationSource, /TO service_role/);
assert.doesNotMatch(
  researchObservationMigrationSource,
  /CREATE POLICY[\s\S]*observatory_research_/,
  "research observations must not have a public RLS policy",
);
assert.doesNotMatch(
  researchObservationMigrationSource,
  /\bgeom\s+geometry/i,
  "research tables must not persist boundary geometry",
);
assert.match(researchPipelineSource, /ANALYSIS_YEARS = \[2024, 2025\]/);
assert.match(researchPipelineSource, /expectedStatisticRows: 1200/);
assert.match(
  researchPipelineSource,
  /responseChecksumSha256[\s\S]*boundaryQa\.source\.responseChecksumSha256/,
);
assert.match(researchPipelineSource, /\.setGeometry\(null\)/);
assert.match(
  researchPipelineSource,
  /\.from\("observatory_research_observations"\)/,
);
assert.doesNotMatch(
  researchPipelineSource,
  /\.from\("observatory_observations"\)/,
  "research run must not write validated public observations",
);
assert.doesNotMatch(
  researchPipelineSource,
  /\.from\("observatory_raster_assets"\)/,
  "district research run must not create raster assets",
);
assert.match(researchStoreSource, /import "server-only"/);
assert.match(
  researchStoreSource,
  /\.eq\("processing_run_id", preview\.processingRunId\)/,
);
assert.match(
  researchStoreSource,
  /research observation provenance does not match/,
);
assert.match(observationsSource, /status: "research"/);
assert.match(observationsSource, /"Cache-Control": "no-store"/);
assert.match(observatoryWorkspaceSource, /DataState[\s\S]*"research"/);
assert.match(observatoryWorkspaceSource, /validCoverage|Coverage/);
assert.match(observatoryWorkspaceSource, /p10–p90/);

const requiredTables = [
  "observatory_datasets",
  "observatory_dataset_versions",
  "observatory_products",
  "observatory_product_datasets",
  "observatory_areas",
  "observatory_processing_runs",
  "observatory_processing_run_inputs",
  "observatory_observations",
  "observatory_raster_assets",
  "observatory_quality_flags",
];

for (const table of requiredTables) {
  assert.match(
    migrationSource,
    new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`),
    `${table} must exist in the v2 migration`,
  );
  assert.match(
    migrationSource,
    new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`),
    `${table} must enable RLS`,
  );
}

assert.doesNotMatch(
  migrationSource,
  /INSERT\s+INTO[\s\S]*district_statistics|SELECT[\s\S]*FROM\s+district_statistics/i,
  "v2 migration must not copy legacy wide-table values",
);

console.log(JSON.stringify({
  status: "passed",
  areaCount: areaCodes.size,
  productCount: productIds.length,
  tablesChecked: requiredTables.length,
  officialBoundaryStatus: boundaryReport.acceptance.status,
  sentinelSourceStatus: sentinelReport.acceptance.status,
  ndviFieldPreflightStatus: ndviFieldQa.qa.fieldQaStatus,
  exhaustiveTileJobs: exhaustivePlan.jobs.length,
  exhaustiveQaStatus: exhaustiveQa.qa.status,
  boundaryAuthorizationStatus: boundaryAuthorization.decisionStatus,
  cityMapBasemapStatus: cityMapReport.consumptionPolicy.status,
  cityMapBoundaryQaStatus: cityMapBoundaryQa.qa.status,
}));

function assertTilesPartitionBounds(tiles, expectedBounds) {
  const [west, south, east, north] = expectedBounds;
  const expectedArea = (east - west) * (north - south);
  const tileArea = tiles.reduce(
    (sum, tile) =>
      sum
      + (tile.bounds[2] - tile.bounds[0])
        * (tile.bounds[3] - tile.bounds[1]),
    0,
  );
  assert.ok(Math.abs(tileArea - expectedArea) < 1e-12);

  for (let leftIndex = 0; leftIndex < tiles.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < tiles.length;
      rightIndex += 1
    ) {
      const left = tiles[leftIndex].bounds;
      const right = tiles[rightIndex].bounds;
      const overlapWidth = Math.max(
        0,
        Math.min(left[2], right[2]) - Math.max(left[0], right[0]),
      );
      const overlapHeight = Math.max(
        0,
        Math.min(left[3], right[3]) - Math.max(left[1], right[1]),
      );
      assert.equal(overlapWidth * overlapHeight, 0);
    }
  }
}
