import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ee from "@google/earthengine";
import dotenv from "dotenv";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REGISTRY_PATH = resolve(ROOT, "config/observatory/registry.json");
const RECIPE_PATH = resolve(
  ROOT,
  "config/observatory/recipes/ndvi-seasonal-v1.0.0.json",
);
const REPORT_PATH = resolve(
  ROOT,
  "reports/observatory/sentinel-2-source-intake.json",
);
const DATASET_ID = "sentinel-2-l2a";
const ANALYSIS_YEAR = 2025;
const BANGKOK_RESEARCH_ENVELOPE = [100.25, 13.35, 101.0, 14.15];
const REQUIRED_PROPERTIES = [
  "CLOUDY_PIXEL_PERCENTAGE",
  "MGRS_TILE",
  "PROCESSING_BASELINE",
  "PRODUCT_ID",
  "SPACECRAFT_NAME",
];
const SEASONS = [
  {
    id: "hot",
    start: `${ANALYSIS_YEAR}-03-01`,
    endExclusive: `${ANALYSIS_YEAR}-06-01`,
  },
  {
    id: "wet",
    start: `${ANALYSIS_YEAR}-06-01`,
    endExclusive: `${ANALYSIS_YEAR}-11-01`,
  },
  {
    id: "cool",
    start: `${ANALYSIS_YEAR}-11-01`,
    endExclusive: `${ANALYSIS_YEAR + 1}-03-01`,
  },
];
const WINDOW_START = SEASONS[0].start;
const WINDOW_END_EXCLUSIVE = SEASONS.at(-1).endExclusive;

dotenv.config({ path: resolve(ROOT, ".env.local"), quiet: true });

const [registryRaw, recipeRaw] = await Promise.all([
  readFile(REGISTRY_PATH, "utf8"),
  readFile(RECIPE_PATH, "utf8"),
]);
const registry = JSON.parse(registryRaw);
const recipe = JSON.parse(recipeRaw);
const dataset = registry.datasets.find((item) => item.id === DATASET_ID);

if (!dataset) {
  throw new Error(`${DATASET_ID} is missing from the Observatory registry`);
}
if (recipe.source.datasetId !== DATASET_ID) {
  throw new Error("NDVI recipe does not reference the Sentinel-2 dataset");
}

await initializeEarthEngine();

const collectionAssetId =
  `projects/earthengine-public/assets/${recipe.source.collectionId}`;
const collectionAsset = await getAsset(collectionAssetId);
const bounds = ee.Geometry.Rectangle(BANGKOK_RESEARCH_ENVELOPE, null, false);
const collection = ee
  .ImageCollection(recipe.source.collectionId)
  .filterBounds(bounds)
  .filterDate(WINDOW_START, WINDOW_END_EXCLUSIVE)
  .sort("system:time_start");
const firstImage = ee.Image(collection.first());
const requiredBands = [
  recipe.source.bands.red,
  recipe.source.bands.nir,
  recipe.source.bands.quality,
];

const inventory = await evaluate(
  ee.Dictionary({
    sceneCount: collection.size(),
    sceneIds: collection.aggregate_array("system:index"),
    sensingTimes: collection.aggregate_array("system:time_start"),
    productIdCount: collection.aggregate_count("PRODUCT_ID"),
    processingBaselines: collection.aggregate_histogram(
      "PROCESSING_BASELINE",
    ),
    mgrsTiles: collection.aggregate_histogram("MGRS_TILE"),
    spacecraft: collection.aggregate_histogram("SPACECRAFT_NAME"),
    cloudPercentageStats: collection.aggregate_stats(
      "CLOUDY_PIXEL_PERCENTAGE",
    ),
    firstImageBandNames: firstImage.bandNames(),
    redBandCrs: firstImage.select(recipe.source.bands.red).projection().crs(),
    nirBandCrs: firstImage.select(recipe.source.bands.nir).projection().crs(),
    qualityBandCrs: firstImage
      .select(recipe.source.bands.quality)
      .projection()
      .crs(),
    selectableSceneCount: collection.select(requiredBands).size(),
    seasonSceneCounts: ee.Dictionary.fromLists(
      SEASONS.map((season) => season.id),
      SEASONS.map((season) =>
        collection.filterDate(season.start, season.endExclusive).size(),
      ),
    ),
  }),
);

const manifest = {
  schemaVersion: "earth-engine-scene-manifest/v1",
  datasetId: DATASET_ID,
  collectionId: recipe.source.collectionId,
  analysisYear: ANALYSIS_YEAR,
  query: {
    bounds: BANGKOK_RESEARCH_ENVELOPE,
    start: WINDOW_START,
    endExclusive: WINDOW_END_EXCLUSIVE,
    seasons: SEASONS,
  },
  sceneIds: inventory.sceneIds,
  sensingTimes: inventory.sensingTimes,
};
const manifestChecksumSha256 = sha256(stableStringify(manifest));
const versionLabel =
  `bangkok-seasonal-${ANALYSIS_YEAR}-${manifestChecksumSha256.slice(0, 12)}`;

const blockers = [];
if (collectionAsset.type !== "ImageCollection") {
  blockers.push(
    `expected ImageCollection asset, received ${collectionAsset.type ?? "unknown"}`,
  );
}
if (inventory.sceneCount < 1) {
  blockers.push("the research inventory contains no Sentinel-2 scenes");
}
if (inventory.sceneIds.length !== inventory.sceneCount) {
  blockers.push("scene ID inventory is incomplete");
}
if (inventory.sensingTimes.length !== inventory.sceneCount) {
  blockers.push("scene sensing-time inventory is incomplete");
}
if (inventory.productIdCount !== inventory.sceneCount) {
  blockers.push("one or more scenes are missing PRODUCT_ID");
}
if (inventory.selectableSceneCount !== inventory.sceneCount) {
  blockers.push("one or more scenes are missing required NDVI or QA bands");
}

const missingFirstImageBands = requiredBands.filter(
  (band) => !inventory.firstImageBandNames.includes(band),
);
if (missingFirstImageBands.length > 0) {
  blockers.push(
    `required bands missing from first scene: ${missingFirstImageBands.join(", ")}`,
  );
}
for (const property of REQUIRED_PROPERTIES) {
  const observed =
    property === "CLOUDY_PIXEL_PERCENTAGE"
      ? inventory.cloudPercentageStats?.valid_count
      : property === "MGRS_TILE"
        ? histogramCount(inventory.mgrsTiles)
        : property === "PROCESSING_BASELINE"
          ? histogramCount(inventory.processingBaselines)
          : property === "PRODUCT_ID"
            ? inventory.productIdCount
            : histogramCount(inventory.spacecraft);
  if (observed !== inventory.sceneCount) {
    blockers.push(
      `${property} is present on ${observed ?? 0} of ${inventory.sceneCount} scenes`,
    );
  }
}
for (const season of SEASONS) {
  const count = inventory.seasonSceneCounts[season.id] ?? 0;
  if (count < recipe.quality.minSceneCount) {
    blockers.push(
      `${season.id} season has ${count} scenes, below ${recipe.quality.minSceneCount}`,
    );
  }
}
if (
  dataset.license.status !== "verified"
  || dataset.license.redistribution !== "allowed"
) {
  blockers.push("Copernicus Sentinel reuse terms are not verified in registry");
}
if (!dataset.license.attributionTemplate) {
  blockers.push("Copernicus modified-data attribution template is missing");
}

const report = {
  reportSchemaVersion: "observatory-source-intake/v1",
  registryVersion: registry.registryVersion,
  datasetId: DATASET_ID,
  inspectedAt: new Date().toISOString(),
  source: {
    provider: "European Union / ESA / Copernicus",
    accessPlatform: "Google Earth Engine",
    collectionId: recipe.source.collectionId,
    collectionAssetId,
    collectionAssetType: collectionAsset.type,
    catalogUrl:
      "https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR_HARMONIZED",
    legalNoticeUrl:
      "https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice",
    collectionAvailabilityStart: collectionAsset.startTime ?? null,
    collectionAvailabilityEnd: collectionAsset.endTime ?? null,
  },
  version: {
    versionLabel,
    schemaVersion: manifest.schemaVersion,
    manifestChecksumSha256,
    sourceSnapshotUri:
      `gee://${recipe.source.collectionId}` +
      `?bounds=${BANGKOK_RESEARCH_ENVELOPE.join(",")}` +
      `&start=${WINDOW_START}&end=${WINDOW_END_EXCLUSIVE}` +
      `&manifestSha256=${manifestChecksumSha256}`,
    observationStart: `${WINDOW_START}T00:00:00.000Z`,
    observationEnd: `${WINDOW_END_EXCLUSIVE}T00:00:00.000Z`,
    sceneManifest: manifest,
  },
  contract: {
    requiredBands,
    requiredProperties: REQUIRED_PROPERTIES,
    reflectanceScaleFactor: recipe.source.reflectanceScaleFactor,
    qualityBandNativeScaleMeters:
      recipe.processing.qualityBandNativeScaleMeters,
    analysisScaleMeters: recipe.processing.nativeScaleMeters,
    analysisCrs: recipe.processing.analysisCrs,
    attributionTemplate: dataset.license.attributionTemplate,
  },
  inventory: {
    sceneCount: inventory.sceneCount,
    seasonSceneCounts: inventory.seasonSceneCounts,
    processingBaselines: inventory.processingBaselines,
    mgrsTiles: inventory.mgrsTiles,
    spacecraft: inventory.spacecraft,
    cloudPercentageStats: inventory.cloudPercentageStats,
    firstImageBandNames: inventory.firstImageBandNames,
    bandCrs: {
      red: inventory.redBandCrs,
      nir: inventory.nirBandCrs,
      quality: inventory.qualityBandCrs,
    },
  },
  acceptance: {
    status: blockers.length === 0 ? "validated" : "blocked",
    datasetVersionStatus: blockers.length === 0 ? "validated" : "acceptance",
    blockers,
    productPublished: false,
    boundaryGeometryUsed: false,
    observationsCreated: false,
    rasterAssetsCreated: false,
  },
};

if (process.argv.includes("--write-report")) {
  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

console.log(
  JSON.stringify({
    datasetId: report.datasetId,
    versionLabel,
    sceneCount: inventory.sceneCount,
    seasons: inventory.seasonSceneCounts,
    status: report.acceptance.status,
    reportWritten: process.argv.includes("--write-report"),
  }),
);

function initializeEarthEngine() {
  const serviceAccountJson = process.env.GEE_SERVICE_ACCOUNT_JSON;
  const credentials = serviceAccountJson
    ? JSON.parse(serviceAccountJson)
    : {
        client_email: process.env.GEE_CLIENT_EMAIL,
        private_key: process.env.GEE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        project_id: process.env.GEE_PROJECT_ID,
      };

  if (!credentials.client_email || !credentials.private_key) {
    throw new Error(
      "Missing GEE_SERVICE_ACCOUNT_JSON or GEE_CLIENT_EMAIL/GEE_PRIVATE_KEY",
    );
  }

  return new Promise((resolvePromise, rejectPromise) => {
    ee.data.authenticateViaPrivateKey(
      credentials,
      () => {
        ee.initialize(
          null,
          null,
          resolvePromise,
          rejectPromise,
          null,
          credentials.project_id,
        );
      },
      rejectPromise,
    );
  });
}

function getAsset(assetId) {
  return new Promise((resolvePromise, rejectPromise) => {
    ee.data.getAsset(assetId, resolvePromise, rejectPromise);
  });
}

function evaluate(computedObject) {
  return new Promise((resolvePromise, rejectPromise) => {
    computedObject.evaluate(resolvePromise, rejectPromise);
  });
}

function histogramCount(histogram) {
  return Object.values(histogram ?? {}).reduce(
    (sum, count) => sum + Number(count),
    0,
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
