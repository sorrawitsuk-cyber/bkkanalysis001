import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REGISTRY_PATH = resolve(ROOT, "config/observatory/registry.json");
const VALID_STATUSES = new Set([
  "provisional",
  "acceptance",
  "research",
  "validated",
  "retired",
]);
const VALID_LICENSE_STATUSES = new Set([
  "verified",
  "unverified",
  "restricted",
]);
const VALID_REDISTRIBUTION = new Set(["allowed", "pending", "restricted"]);
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const METHOD_VERSION_PATTERN = /^[a-z0-9-]+-v\d+\.\d+\.\d+$/;

const errors = [];

function fail(path, message) {
  errors.push(`${path}: ${message}`);
}

function requireText(value, path) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(path, "must be a non-empty string");
  }
}

function requireHttpsUrl(value, path) {
  requireText(value, path);
  try {
    if (new URL(value).protocol !== "https:") {
      fail(path, "must use https");
    }
  } catch {
    fail(path, "must be a valid URL");
  }
}

function requireUniqueIds(items, path) {
  const ids = new Set();
  for (const [index, item] of items.entries()) {
    if (!ID_PATTERN.test(item.id ?? "")) {
      fail(`${path}[${index}].id`, "must be kebab-case");
    }
    if (ids.has(item.id)) {
      fail(`${path}[${index}].id`, `duplicate id "${item.id}"`);
    }
    ids.add(item.id);
  }
  return ids;
}

const rawRegistry = await readFile(REGISTRY_PATH, "utf8");
const registry = JSON.parse(rawRegistry);

if (registry.schemaVersion !== "observatory-registry/v1") {
  fail("schemaVersion", "unsupported registry schema");
}
requireText(registry.registryVersion, "registryVersion");
requireText(registry.lastReviewedAt, "lastReviewedAt");

if (!Array.isArray(registry.datasets) || registry.datasets.length === 0) {
  fail("datasets", "must contain at least one dataset");
}
if (!Array.isArray(registry.products) || registry.products.length === 0) {
  fail("products", "must contain at least one product");
}
if (!Array.isArray(registry.runtimeArtifacts)) {
  fail("runtimeArtifacts", "must be an array");
}

const serializedRegistry = JSON.stringify(registry);
for (const excludedSource of registry.scope?.excludedSources ?? []) {
  const registryWithoutPolicy = JSON.stringify({
    datasets: registry.datasets,
    products: registry.products,
    runtimeArtifacts: registry.runtimeArtifacts,
  });
  if (registryWithoutPolicy.toLowerCase().includes(excludedSource.toLowerCase())) {
    fail("scope.excludedSources", `${excludedSource} is excluded but appears in the registry`);
  }
}

for (const label of registry.publicationPolicy?.forbiddenSourceLabels ?? []) {
  if (!label || typeof label !== "string") {
    fail("publicationPolicy.forbiddenSourceLabels", "labels must be non-empty strings");
  } else {
    const registryData = JSON.stringify({
      datasets: registry.datasets,
      products: registry.products,
      runtimeArtifacts: registry.runtimeArtifacts,
    }).toLowerCase();
    if (registryData.includes(label.toLowerCase())) {
      fail(
        "publicationPolicy.forbiddenSourceLabels",
        `forbidden source label "${label}" appears in registry data`,
      );
    }
  }
}

const datasetIds = requireUniqueIds(registry.datasets ?? [], "datasets");
const productIds = requireUniqueIds(registry.products ?? [], "products");
requireUniqueIds(registry.runtimeArtifacts ?? [], "runtimeArtifacts");

for (const [index, dataset] of (registry.datasets ?? []).entries()) {
  const path = `datasets[${index}]`;
  requireText(dataset.name, `${path}.name`);
  requireText(dataset.owner, `${path}.owner`);
  requireHttpsUrl(dataset.sourceUrl, `${path}.sourceUrl`);
  requireText(dataset.roleTh, `${path}.roleTh`);
  requireText(dataset.measurementType, `${path}.measurementType`);
  requireText(dataset.sourceClass, `${path}.sourceClass`);
  requireText(dataset.spatialResolution, `${path}.spatialResolution`);
  requireText(dataset.temporalCadence, `${path}.temporalCadence`);
  if (dataset.resources !== undefined) {
    if (!Array.isArray(dataset.resources) || dataset.resources.length === 0) {
      fail(`${path}.resources`, "must be a non-empty array when present");
    } else {
      requireUniqueIds(dataset.resources, `${path}.resources`);
      for (const [resourceIndex, resource] of dataset.resources.entries()) {
        requireText(resource.format, `${path}.resources[${resourceIndex}].format`);
        requireHttpsUrl(resource.url, `${path}.resources[${resourceIndex}].url`);
      }
    }
  }

  if (!VALID_LICENSE_STATUSES.has(dataset.license?.status)) {
    fail(`${path}.license.status`, "invalid license status");
  }
  requireText(dataset.license?.name, `${path}.license.name`);
  requireHttpsUrl(dataset.license?.url, `${path}.license.url`);
  if (!VALID_REDISTRIBUTION.has(dataset.license?.redistribution)) {
    fail(`${path}.license.redistribution`, "invalid redistribution status");
  }
  if (
    dataset.license?.status === "verified"
    && dataset.license?.redistribution === "allowed"
  ) {
    requireText(
      dataset.license?.attributionTemplate,
      `${path}.license.attributionTemplate`,
    );
  }
  if (!VALID_STATUSES.has(dataset.acceptance?.status)) {
    fail(`${path}.acceptance.status`, "invalid acceptance status");
  }
  if (!Array.isArray(dataset.acceptance?.blockers)) {
    fail(`${path}.acceptance.blockers`, "must be an array");
  }

  if (dataset.acceptance?.status === "validated") {
    if (dataset.license?.status !== "verified") {
      fail(path, "validated dataset must have verified license");
    }
    if (dataset.license?.redistribution !== "allowed") {
      fail(path, "validated dataset must allow redistribution");
    }
    if (!dataset.acceptance.checkedAt) {
      fail(path, "validated dataset must have checkedAt");
    }
    if (dataset.acceptance.blockers.length !== 0) {
      fail(path, "validated dataset cannot have acceptance blockers");
    }
  }
}

for (const [index, product] of (registry.products ?? []).entries()) {
  const path = `products[${index}]`;
  requireText(product.nameTh, `${path}.nameTh`);
  requireText(product.nameEn, `${path}.nameEn`);
  requireText(product.measurementType, `${path}.measurementType`);
  requireText(product.unit, `${path}.unit`);

  if (!Array.isArray(product.sourceDatasetIds) || product.sourceDatasetIds.length === 0) {
    fail(`${path}.sourceDatasetIds`, "must reference at least one dataset");
  } else {
    for (const datasetId of product.sourceDatasetIds) {
      if (!datasetIds.has(datasetId)) {
        fail(`${path}.sourceDatasetIds`, `unknown dataset "${datasetId}"`);
      }
    }
  }

  if (!METHOD_VERSION_PATTERN.test(product.recipe?.methodVersion ?? "")) {
    fail(`${path}.recipe.methodVersion`, "must end in semantic version, for example product-v1.0.0");
  }
  requireText(product.recipe?.temporalComposite, `${path}.recipe.temporalComposite`);
  requireText(product.recipe?.aggregation, `${path}.recipe.aggregation`);
  if (!Number.isFinite(product.recipe?.nativeScaleMeters) || product.recipe.nativeScaleMeters <= 0) {
    fail(`${path}.recipe.nativeScaleMeters`, "must be a positive number");
  }
  if (!Array.isArray(product.recipe?.qaRules) || product.recipe.qaRules.length === 0) {
    fail(`${path}.recipe.qaRules`, "must contain QA rules");
  }
  if (product.evidence !== undefined) {
    const evidence = product.evidence;
    requireText(evidence.recipeManifestPath, `${path}.evidence.recipeManifestPath`);
    requireText(evidence.goldenFixturePath, `${path}.evidence.goldenFixturePath`);
    requireText(evidence.goldenQaReportPath, `${path}.evidence.goldenQaReportPath`);
    if (!SHA256_PATTERN.test(evidence.recipeManifestChecksumSha256 ?? "")) {
      fail(
        `${path}.evidence.recipeManifestChecksumSha256`,
        "must be a lowercase SHA-256 checksum",
      );
    }
    if (!["passed", "failed"].includes(evidence.algorithmFixtureStatus)) {
      fail(`${path}.evidence.algorithmFixtureStatus`, "must be passed or failed");
    }

    const [recipeRaw, fixtureRaw, qaReportRaw, fieldQaReportRaw] =
      await Promise.all([
      readFile(resolve(ROOT, evidence.recipeManifestPath), "utf8"),
      readFile(resolve(ROOT, evidence.goldenFixturePath), "utf8"),
      readFile(resolve(ROOT, evidence.goldenQaReportPath), "utf8"),
      evidence.fieldQaReportPath
        ? readFile(resolve(ROOT, evidence.fieldQaReportPath), "utf8")
        : Promise.resolve(null),
    ]);
    const recipeManifest = JSON.parse(recipeRaw);
    const fixtureManifest = JSON.parse(fixtureRaw);
    const qaReport = JSON.parse(qaReportRaw);
    const fieldQaReport = fieldQaReportRaw
      ? JSON.parse(fieldQaReportRaw)
      : null;
    const recipeChecksum = createHash("sha256")
      .update(recipeRaw)
      .digest("hex");
    const fixtureChecksum = createHash("sha256")
      .update(fixtureRaw)
      .digest("hex");

    if (recipeChecksum !== evidence.recipeManifestChecksumSha256) {
      fail(
        `${path}.evidence.recipeManifestChecksumSha256`,
        `expected ${evidence.recipeManifestChecksumSha256}, received ${recipeChecksum}`,
      );
    }
    if (recipeManifest.productId !== product.id) {
      fail(`${path}.evidence.recipeManifestPath`, "recipe productId does not match");
    }
    if (recipeManifest.methodVersion !== product.recipe.methodVersion) {
      fail(`${path}.evidence.recipeManifestPath`, "recipe methodVersion does not match");
    }
    if (!product.sourceDatasetIds.includes(recipeManifest.source?.datasetId)) {
      fail(`${path}.evidence.recipeManifestPath`, "recipe source dataset is not registered on product");
    }
    if (
      recipeManifest.quality?.minValidCoverage
      !== product.publishGate?.minValidCoverage
    ) {
      fail(`${path}.evidence.recipeManifestPath`, "recipe coverage gate does not match product");
    }
    if (
      recipeManifest.quality?.minSceneCount
      !== product.publishGate?.minSceneCount
    ) {
      fail(`${path}.evidence.recipeManifestPath`, "recipe scene gate does not match product");
    }
    if (
      recipeManifest.processing?.nativeScaleMeters
      !== product.recipe?.nativeScaleMeters
    ) {
      fail(`${path}.evidence.recipeManifestPath`, "recipe native scale does not match product");
    }
    if (recipeManifest.executionClass !== "offline-batch") {
      fail(`${path}.evidence.recipeManifestPath`, "recipe must run as offline-batch");
    }
    if (recipeManifest.publication?.allowsPublicRequestProcessing !== false) {
      fail(`${path}.evidence.recipeManifestPath`, "recipe must prohibit public request processing");
    }
    if (fixtureManifest.fixtureId !== qaReport.fixture?.fixtureId) {
      fail(`${path}.evidence.goldenQaReportPath`, "fixture id does not match QA report");
    }
    if (qaReport.recipe?.checksumSha256 !== recipeChecksum) {
      fail(`${path}.evidence.goldenQaReportPath`, "recipe checksum does not match QA report");
    }
    if (qaReport.fixture?.checksumSha256 !== fixtureChecksum) {
      fail(`${path}.evidence.goldenQaReportPath`, "fixture checksum does not match QA report");
    }
    if (qaReport.recipe?.methodVersion !== product.recipe.methodVersion) {
      fail(`${path}.evidence.goldenQaReportPath`, "method version does not match QA report");
    }
    if (qaReport.summary?.failed !== 0 || qaReport.summary?.passed < 1) {
      fail(`${path}.evidence.goldenQaReportPath`, "golden QA report has failed scenarios");
    }
    if (
      qaReport.publicationStatus
      !==
        "algorithm-fixture-and-field-preflight-passed-boundary-and-exhaustive-qa-pending"
    ) {
      fail(
        `${path}.evidence.goldenQaReportPath`,
        "QA report must keep boundary and field QA pending",
      );
    }
    if (evidence.algorithmFixtureStatus !== "passed") {
      fail(`${path}.evidence.algorithmFixtureStatus`, "only passed evidence may be registered");
    }
    if (evidence.fieldQaReportPath !== undefined) {
      requireText(
        evidence.fieldQaReportPath,
        `${path}.evidence.fieldQaReportPath`,
      );
      if (
        !["preflight-passed", "preflight-failed"].includes(
          evidence.fieldQaStatus,
        )
      ) {
        fail(
          `${path}.evidence.fieldQaStatus`,
          "must be preflight-passed or preflight-failed",
        );
      }
      if (
        fieldQaReport?.reportSchemaVersion !== "observatory-field-qa/v1"
      ) {
        fail(
          `${path}.evidence.fieldQaReportPath`,
          "unsupported field QA report schema",
        );
      }
      if (
        fieldQaReport?.productId !== product.id
        || fieldQaReport?.methodVersion !== product.recipe.methodVersion
      ) {
        fail(
          `${path}.evidence.fieldQaReportPath`,
          "field QA product or method does not match",
        );
      }
      if (fieldQaReport?.qa?.fieldQaStatus !== evidence.fieldQaStatus) {
        fail(
          `${path}.evidence.fieldQaStatus`,
          "does not match field QA report",
        );
      }
      if (
        fieldQaReport?.scope?.boundaryGeometryUsed !== false
        || fieldQaReport?.scope?.districtStatisticsCreated !== false
      ) {
        fail(
          `${path}.evidence.fieldQaReportPath`,
          "preflight must not use boundary geometry or district statistics",
        );
      }
      if (
        fieldQaReport?.publication?.status
        !== "blocked-boundary-and-exhaustive-qa-pending"
      ) {
        fail(
          `${path}.evidence.fieldQaReportPath`,
          "field preflight must remain blocked from publication",
        );
      }
    }
  }

  const gate = product.publishGate;
  if (!VALID_STATUSES.has(gate?.status)) {
    fail(`${path}.publishGate.status`, "invalid product status");
  }
  if (
    !Number.isFinite(gate?.minValidCoverage)
    || gate.minValidCoverage < 0
    || gate.minValidCoverage > 1
  ) {
    fail(`${path}.publishGate.minValidCoverage`, "must be between 0 and 1");
  }
  if (!Number.isInteger(gate?.minSceneCount) || gate.minSceneCount < 0) {
    fail(`${path}.publishGate.minSceneCount`, "must be a non-negative integer");
  }

  if (gate?.status === "validated") {
    const unvalidatedSources = product.sourceDatasetIds.filter((datasetId) => {
      const source = registry.datasets.find((dataset) => dataset.id === datasetId);
      return source?.acceptance.status !== "validated";
    });
    if (unvalidatedSources.length > 0) {
      fail(path, `validated product has unvalidated sources: ${unvalidatedSources.join(", ")}`);
    }
  }
}

for (const [index, artifact] of (registry.runtimeArtifacts ?? []).entries()) {
  const path = `runtimeArtifacts[${index}]`;
  if (!datasetIds.has(artifact.datasetId)) {
    fail(`${path}.datasetId`, `unknown dataset "${artifact.datasetId}"`);
  }
  if (!SHA256_PATTERN.test(artifact.checksumSha256 ?? "")) {
    fail(`${path}.checksumSha256`, "must be a lowercase SHA-256 checksum");
  }
  if (!VALID_STATUSES.has(artifact.status)) {
    fail(`${path}.status`, "invalid artifact status");
  }

  const artifactPath = resolve(ROOT, artifact.path);
  const artifactRaw = await readFile(artifactPath, "utf8");
  const actualChecksum = createHash("sha256").update(artifactRaw).digest("hex");
  if (actualChecksum !== artifact.checksumSha256) {
    fail(`${path}.checksumSha256`, `expected ${artifact.checksumSha256}, received ${actualChecksum}`);
  }

  const geojson = JSON.parse(artifactRaw);
  if (geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
    fail(path, "runtime artifact must be a GeoJSON FeatureCollection");
    continue;
  }
  if (geojson.features.length !== artifact.featureCount) {
    fail(`${path}.featureCount`, `expected ${artifact.featureCount}, received ${geojson.features.length}`);
  }

  const areaCodes = new Set();
  for (const [featureIndex, feature] of geojson.features.entries()) {
    const properties = feature.properties ?? {};
    const propertyNames = Object.keys(properties);
    const unknown = propertyNames.filter(
      (property) => !artifact.allowedProperties.includes(property),
    );
    const forbidden = propertyNames.filter(
      (property) => artifact.forbiddenProperties.includes(property),
    );
    if (unknown.length > 0) {
      fail(`${path}.features[${featureIndex}]`, `unexpected properties: ${unknown.join(", ")}`);
    }
    if (forbidden.length > 0) {
      fail(`${path}.features[${featureIndex}]`, `forbidden properties: ${forbidden.join(", ")}`);
    }
    if (!/^BKK-D\d{2}$/.test(properties.areaCode ?? "")) {
      fail(`${path}.features[${featureIndex}].areaCode`, "must match BKK-D00");
    }
    if (areaCodes.has(properties.areaCode)) {
      fail(`${path}.features[${featureIndex}].areaCode`, "duplicate area code");
    }
    areaCodes.add(properties.areaCode);
  }
}

for (const status of registry.publicationPolicy?.publicDatasetStatuses ?? []) {
  if (!VALID_STATUSES.has(status)) {
    fail("publicationPolicy.publicDatasetStatuses", `invalid status "${status}"`);
  }
}
for (const status of registry.publicationPolicy?.publicProductStatuses ?? []) {
  if (!VALID_STATUSES.has(status)) {
    fail("publicationPolicy.publicProductStatuses", `invalid status "${status}"`);
  }
}

if (
  registry.publicationPolicy?.failureMode !== "unavailable"
  || serializedRegistry.includes('"failureMode":"fallback"')
) {
  fail("publicationPolicy.failureMode", "must fail closed with unavailable");
}

if (errors.length > 0) {
  console.error(`Observatory registry validation failed with ${errors.length} error(s):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(JSON.stringify({
  registryVersion: registry.registryVersion,
  datasets: datasetIds.size,
  products: productIds.size,
  runtimeArtifacts: registry.runtimeArtifacts.length,
  status: "valid",
}));
