import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const [
  registryRaw,
  areasRaw,
  boundaryReportRaw,
  catalogSource,
  observationsSource,
  migrationSource,
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
    readFile(resolve(ROOT, "src/lib/observatory/catalog.ts"), "utf8"),
    readFile(resolve(ROOT, "src/app/api/v1/observations/route.ts"), "utf8"),
    readFile(
      resolve(
        ROOT,
        "supabase/migrations/20260728023000_observatory_v2_core.sql",
      ),
      "utf8",
    ),
  ]);

const registry = JSON.parse(registryRaw);
const areas = JSON.parse(areasRaw);
const boundaryReport = JSON.parse(boundaryReportRaw);

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
}));
