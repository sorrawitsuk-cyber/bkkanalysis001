import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const QA_CONFIG_PATH = resolve(
  ROOT,
  "config/observatory/qa/ndvi-exhaustive-coverage-v1.0.0.json",
);
const RECIPE_PATH = resolve(
  ROOT,
  "config/observatory/recipes/ndvi-seasonal-v1.0.0.json",
);
const SOURCE_REPORT_PATH = resolve(
  ROOT,
  "reports/observatory/sentinel-2-source-intake.json",
);
const REPORT_PATH = resolve(
  ROOT,
  "reports/observatory/ndvi-2025-exhaustive-plan.json",
);

const [configRaw, recipeRaw, sourceReportRaw] = await Promise.all([
  readFile(QA_CONFIG_PATH, "utf8"),
  readFile(RECIPE_PATH, "utf8"),
  readFile(SOURCE_REPORT_PATH, "utf8"),
]);
const config = JSON.parse(configRaw);
const recipe = JSON.parse(recipeRaw);
const sourceReport = JSON.parse(sourceReportRaw);

assertPreconditions();

const sourceManifest = sourceReport.version.sceneManifest;
const [west, south, east, north] = sourceManifest.query.bounds;
const longitudeStep = (east - west) / config.grid.columns;
const latitudeStep = (north - south) / config.grid.rows;
const tiles = [];

for (let row = 0; row < config.grid.rows; row += 1) {
  for (let column = 0; column < config.grid.columns; column += 1) {
    const tileWest = west + column * longitudeStep;
    const tileEast =
      column === config.grid.columns - 1
        ? east
        : west + (column + 1) * longitudeStep;
    const tileSouth = south + row * latitudeStep;
    const tileNorth =
      row === config.grid.rows - 1
        ? north
        : south + (row + 1) * latitudeStep;

    tiles.push({
      tileId: `r${pad(row)}-c${pad(column)}`,
      row,
      column,
      bounds: [
        roundCoordinate(tileWest),
        roundCoordinate(tileSouth),
        roundCoordinate(tileEast),
        roundCoordinate(tileNorth),
      ],
    });
  }
}

const jobs = sourceManifest.query.seasons.flatMap((season) =>
  tiles.map((tile) => ({
    jobId: `${season.id}-${tile.tileId}`,
    tileId: tile.tileId,
    seasonId: season.id,
    periodStart: season.start,
    periodEndExclusive: season.endExclusive,
    bounds: tile.bounds,
    maxAttempts: config.retry.maxAttempts,
  })),
);
const stablePlan = {
  schemaVersion: "observatory-exhaustive-plan/v1",
  qaMethodVersion: config.qaMethodVersion,
  productId: config.productId,
  productMethodVersion: config.productMethodVersion,
  analysisYear: sourceManifest.analysisYear,
  sourceDatasetId: sourceReport.datasetId,
  sourceVersionLabel: sourceReport.version.versionLabel,
  sourceManifestChecksumSha256:
    sourceReport.version.manifestChecksumSha256,
  grid: config.grid,
  processing: config.processing,
  retry: config.retry,
  tiles,
  jobs,
};
const planChecksumSha256 = sha256(stableStringify(stablePlan));
const processingRunId = toUuid(
  sha256(
    [
      config.qaMethodVersion,
      recipe.methodVersion,
      sourceReport.version.manifestChecksumSha256,
      planChecksumSha256,
    ].join(":"),
  ),
);
const report = {
  reportSchemaVersion: "observatory-exhaustive-plan/v1",
  createdAt: new Date().toISOString(),
  processingRunId,
  planChecksumSha256,
  ...stablePlan,
  summary: {
    tileCount: tiles.length,
    seasonCount: sourceManifest.query.seasons.length,
    jobCount: jobs.length,
    expectedJobCount:
      config.grid.rows
      * config.grid.columns
      * sourceManifest.query.seasons.length,
  },
  publication: {
    status: "internal-plan-only",
    productPublished: false,
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
    processingRunId,
    qaMethodVersion: config.qaMethodVersion,
    tiles: tiles.length,
    jobs: jobs.length,
    planChecksumSha256,
    reportWritten: process.argv.includes("--write-report"),
  }),
);

function assertPreconditions() {
  if (config.schemaVersion !== "observatory-tiled-qa/v1") {
    throw new Error("Unsupported tiled QA config schema");
  }
  if (config.productId !== recipe.productId) {
    throw new Error("QA config product does not match NDVI recipe");
  }
  if (config.productMethodVersion !== recipe.methodVersion) {
    throw new Error("QA config method does not match NDVI recipe");
  }
  if (sourceReport.acceptance.status !== "validated") {
    throw new Error("Sentinel-2 source is not validated");
  }
  if (
    config.processing.analysisScaleMeters
      !== recipe.processing.nativeScaleMeters
    || config.processing.analysisCrs !== recipe.processing.analysisCrs
  ) {
    throw new Error("Tiled QA scale or CRS does not match NDVI recipe");
  }
  if (
    !Number.isInteger(config.grid.rows)
    || !Number.isInteger(config.grid.columns)
    || config.grid.rows < 1
    || config.grid.columns < 1
  ) {
    throw new Error("Tiled QA grid must use positive integer dimensions");
  }
  if (
    config.publication.allowsPublicProduct
    || config.publication.allowsObservations
    || config.publication.allowsRasterAssets
  ) {
    throw new Error("Tiled QA config unexpectedly permits publication");
  }
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function roundCoordinate(value) {
  return Number(value.toFixed(12));
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

function toUuid(hex) {
  const normalized =
    `${hex.slice(0, 12)}5${hex.slice(13, 16)}`
    + `8${hex.slice(17, 32)}`;
  return [
    normalized.slice(0, 8),
    normalized.slice(8, 12),
    normalized.slice(12, 16),
    normalized.slice(16, 20),
    normalized.slice(20, 32),
  ].join("-");
}
