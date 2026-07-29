import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const [
  registryRaw,
  areasRaw,
  boundaryReportRaw,
  sentinelReportRaw,
  ndviFieldQaRaw,
  exhaustiveConfigRaw,
  exhaustivePlanRaw,
  catalogSource,
  observationsSource,
  migrationSource,
  tileMigrationSource,
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
  ]);

const registry = JSON.parse(registryRaw);
const areas = JSON.parse(areasRaw);
const boundaryReport = JSON.parse(boundaryReportRaw);
const sentinelReport = JSON.parse(sentinelReportRaw);
const ndviFieldQa = JSON.parse(ndviFieldQaRaw);
const exhaustiveConfig = JSON.parse(exhaustiveConfigRaw);
const exhaustivePlan = JSON.parse(exhaustivePlanRaw);

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
