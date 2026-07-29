import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  area as geodesicArea,
  bbox,
  booleanValid,
  featureCollection,
  union,
} from "@turf/turf";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REGISTRY_PATH = resolve(ROOT, "config/observatory/registry.json");
const CONFIG_PATH = resolve(
  ROOT,
  "config/observatory/qa/citymap-district-boundary-v1.0.0.json",
);
const CITYMAP_INTAKE_PATH = resolve(
  ROOT,
  "reports/observatory/bma-citymap-service-intake.json",
);
const GML_INTAKE_PATH = resolve(
  ROOT,
  "reports/observatory/bma-boundary-intake.json",
);
const PROVISIONAL_AREAS_PATH = resolve(
  ROOT,
  "src/data/observatory/bkk-districts.provisional.json",
);
const REPORT_PATH = resolve(
  ROOT,
  "reports/observatory/bma-citymap-boundary-qa.json",
);

const [
  registryRaw,
  configRaw,
  cityMapIntakeRaw,
  gmlIntakeRaw,
  provisionalAreasRaw,
] = await Promise.all([
  readFile(REGISTRY_PATH, "utf8"),
  readFile(CONFIG_PATH, "utf8"),
  readFile(CITYMAP_INTAKE_PATH, "utf8"),
  readFile(GML_INTAKE_PATH, "utf8"),
  readFile(PROVISIONAL_AREAS_PATH, "utf8"),
]);
const registry = JSON.parse(registryRaw);
const config = JSON.parse(configRaw);
const cityMapIntake = JSON.parse(cityMapIntakeRaw);
const gmlIntake = JSON.parse(gmlIntakeRaw);
const provisionalAreas = JSON.parse(provisionalAreasRaw);
const dataset = registry.datasets.find(
  (item) => item.id === config.datasetId,
);
const districtResource = dataset?.resources?.find(
  (item) => item.id === "citymap-district-layer",
);

if (!dataset || !districtResource) {
  throw new Error("CityMap district layer is missing from the registry");
}
if (cityMapIntake.registryVersion !== registry.registryVersion) {
  throw new Error("CityMap service intake does not match the registry version");
}

const queryUrl = new URL(`${districtResource.url}/query`);
queryUrl.search = new URLSearchParams({
  where: "1=1",
  outFields:
    "OBJECTID,DISTRICT_I,DISTRICT_N,AREA_CAL,AREA_BMA,UPDATE_YEAR,CODE",
  returnGeometry: "true",
  outSR: "4326",
  orderByFields: "DISTRICT_I",
  f: "geojson",
}).toString();
const response = await fetch(queryUrl, {
  headers: { "User-Agent": "Bangkok-Urban-Earth-Observatory/1.0" },
  signal: AbortSignal.timeout(30_000),
});

if (!response.ok) {
  throw new Error(`CityMap layer 13 query returned HTTP ${response.status}`);
}

const sourceRaw = await response.text();
const sourceResponseChecksumSha256 = sha256(sourceRaw);
const source = JSON.parse(sourceRaw);

if (
  source.type !== "FeatureCollection"
  || !Array.isArray(source.features)
) {
  throw new Error("CityMap layer 13 did not return a GeoJSON FeatureCollection");
}

const expectedCodes = Array.from(
  {
    length:
      config.expected.districtCodeEnd
      - config.expected.districtCodeStart
      + 1,
  },
  (_, index) => String(config.expected.districtCodeStart + index),
);
const provisionalThaiNames = new Set(
  provisionalAreas.features.map((feature) => feature.properties.nameTh),
);
const perDistrict = source.features
  .map((feature) => {
    const properties = feature.properties ?? {};
    const areaSquareMeters = geodesicArea(feature);
    const areaCalSquareKilometers = Number(properties.AREA_CAL);
    const areaBmaSquareKilometers = Number(properties.AREA_BMA);
    return {
      districtCode: String(properties.DISTRICT_I),
      districtNameTh: String(properties.DISTRICT_N),
      surveyYearBuddhist: Number(properties.UPDATE_YEAR),
      geometryType: feature.geometry?.type ?? null,
      geometryValid: booleanValid(feature),
      vertexCount: countVertices(feature.geometry?.coordinates),
      interiorRingCount: countInteriorRings(feature.geometry),
      geodesicAreaSquareMeters: areaSquareMeters,
      areaCalSquareKilometers,
      areaBmaSquareKilometers,
      relativeDeltaToAreaCal:
        Math.abs(areaSquareMeters / 1_000_000 - areaCalSquareKilometers)
        / areaCalSquareKilometers,
      relativeDeltaToAreaBma:
        Math.abs(areaSquareMeters / 1_000_000 - areaBmaSquareKilometers)
        / areaBmaSquareKilometers,
      thaiNameMatchesApplication: provisionalThaiNames.has(
        String(properties.DISTRICT_N),
      ),
    };
  })
  .sort((left, right) =>
    left.districtCode.localeCompare(right.districtCode),
  );

const collection = featureCollection(source.features);
const collectionBounds = bbox(collection);
const unionGeometry = union(collection);
const totalFeatureAreaSquareMeters = perDistrict.reduce(
  (sum, district) => sum + district.geodesicAreaSquareMeters,
  0,
);
const unionAreaSquareMeters = unionGeometry
  ? geodesicArea(unionGeometry)
  : 0;
const overlapAreaEstimateSquareMeters = Math.max(
  0,
  totalFeatureAreaSquareMeters - unionAreaSquareMeters,
);
const overlapAreaRatio =
  overlapAreaEstimateSquareMeters / totalFeatureAreaSquareMeters;
const invalidDistrictCodes = perDistrict
  .filter((district) => !district.geometryValid)
  .map((district) => district.districtCode);
const districtCodes = perDistrict.map(
  (district) => district.districtCode,
);
const surveyYearsBuddhist = [
  ...new Set(
    perDistrict.map((district) => district.surveyYearBuddhist),
  ),
].sort();
const thaiNameMatchCount = perDistrict.filter(
  (district) => district.thaiNameMatchesApplication,
).length;
const thaiNameMatchRatio = thaiNameMatchCount / perDistrict.length;
const maxRelativeDeltaToAreaCal = Math.max(
  ...perDistrict.map((district) => district.relativeDeltaToAreaCal),
);
const meanRelativeDeltaToAreaCal =
  perDistrict.reduce(
    (sum, district) => sum + district.relativeDeltaToAreaCal,
    0,
  ) / perDistrict.length;
const maxRelativeDeltaToAreaBma = Math.max(
  ...perDistrict.map((district) => district.relativeDeltaToAreaBma),
);
const boundsWithinEnvelope = withinBounds(
  collectionBounds,
  config.expected.bangkokBoundsEnvelope,
);
const blockers = [];

if (perDistrict.length !== config.expected.featureCount) {
  blockers.push(
    `expected ${config.expected.featureCount} features, received ${perDistrict.length}`,
  );
}
if (!sameMembers(districtCodes, expectedCodes)) {
  blockers.push("district codes do not match the complete 1001-1050 set");
}
if (!sameMembers(
  surveyYearsBuddhist.map(String),
  config.expected.surveyYearsBuddhist.map(String),
)) {
  blockers.push("survey years do not match the QA contract");
}
if (
  invalidDistrictCodes.length
  > config.thresholds.maxInvalidGeometryCount
) {
  blockers.push(
    `${invalidDistrictCodes.length} district geometries are invalid`,
  );
}
if (maxRelativeDeltaToAreaCal
  > config.thresholds.maxRelativeDeltaToAreaCal) {
  blockers.push("geodesic area differs from AREA_CAL beyond tolerance");
}
if (overlapAreaRatio > config.thresholds.maxOverlapAreaRatio) {
  blockers.push("district overlap ratio exceeds tolerance");
}
if (
  thaiNameMatchRatio
  < config.thresholds.requiredThaiNameMatchRatio
) {
  blockers.push("Thai district names do not fully match the application list");
}
if (!boundsWithinEnvelope) {
  blockers.push("district bounds fall outside the Bangkok QA envelope");
}
if (
  perDistrict.some(
    (district) =>
      !["Polygon", "MultiPolygon"].includes(district.geometryType),
  )
) {
  blockers.push("district layer contains a non-polygon geometry");
}

const configChecksumSha256 = sha256(configRaw);
const qaSummary = {
  featureCount: perDistrict.length,
  completeOfficialCodeSet: sameMembers(districtCodes, expectedCodes),
  uniqueDistrictCodeCount: new Set(districtCodes).size,
  uniqueThaiNameCount: new Set(
    perDistrict.map((district) => district.districtNameTh),
  ).size,
  thaiNameMatchCount,
  thaiNameMatchRatio,
  surveyYearsBuddhist,
  geometryTypes: [
    ...new Set(perDistrict.map((district) => district.geometryType)),
  ].sort(),
  invalidDistrictCodes,
  totalVertexCount: perDistrict.reduce(
    (sum, district) => sum + district.vertexCount,
    0,
  ),
  totalInteriorRingCount: perDistrict.reduce(
    (sum, district) => sum + district.interiorRingCount,
    0,
  ),
  bounds: collectionBounds,
  boundsWithinEnvelope,
  totalFeatureAreaSquareMeters,
  unionAreaSquareMeters,
  unionGeometryType: unionGeometry?.geometry.type ?? null,
  overlapAreaEstimateSquareMeters,
  overlapAreaRatio,
  maxRelativeDeltaToAreaCal,
  meanRelativeDeltaToAreaCal,
  maxRelativeDeltaToAreaBma,
};
const resultChecksumSha256 = sha256(
  JSON.stringify({
    qaMethodVersion: config.qaMethodVersion,
    configChecksumSha256,
    sourceResponseChecksumSha256,
    qaSummary,
    perDistrict,
  }),
);
const report = {
  reportSchemaVersion: "observatory-boundary-qa/v1",
  registryVersion: registry.registryVersion,
  datasetId: dataset.id,
  serviceVersion: {
    versionLabel: cityMapIntake.version.versionLabel,
    manifestChecksumSha256:
      cityMapIntake.version.manifestChecksumSha256,
  },
  inspectedAt: new Date().toISOString(),
  qaMethodVersion: config.qaMethodVersion,
  config: {
    path:
      "config/observatory/qa/citymap-district-boundary-v1.0.0.json",
    checksumSha256: configChecksumSha256,
  },
  source: {
    mode: "remote-public-arcgis-rest",
    layerId: config.serviceLayerId,
    endpoint: districtResource.url,
    httpStatus: response.status,
    contentType: response.headers.get("content-type"),
    contentLengthBytes: Buffer.byteLength(sourceRaw),
    responseChecksumSha256: sourceResponseChecksumSha256,
    geometryRequested: true,
    sourceResponsePersisted: false,
    geometryPersisted: false,
  },
  qa: {
    status:
      blockers.length === 0 ? "passed-technical-qa" : "failed",
    resultChecksumSha256,
    ...qaSummary,
    blockers,
  },
  priorOfficialSnapshotComparison: {
    datasetId: gmlIntake.datasetId,
    sourceChecksumSha256: gmlIntake.source.checksumSha256,
    totalFeatureAreaSquareMeters:
      gmlIntake.geometryQa.totalFeatureAreaSquareMeters,
    relativeTotalAreaDelta:
      Math.abs(
        totalFeatureAreaSquareMeters
        - gmlIntake.geometryQa.totalFeatureAreaSquareMeters
      ) / gmlIntake.geometryQa.totalFeatureAreaSquareMeters,
    interpretation:
      "CityMap layer 13 and the earlier GML are distinct reviewed snapshots; aggregate difference is recorded, not treated as equality.",
  },
  areaSemantics: {
    geometryGateField: "AREA_CAL",
    geometryGateReason:
      "AREA_CAL is the service-calculated shape area; geodesic calculation and service calculation use different area models.",
    administrativeContextField: "AREA_BMA",
    administrativeContextReason:
      "AREA_BMA is area reported by BMA and is retained as context, not used as a geometry validity threshold.",
  },
  perDistrict,
  acceptance: {
    status:
      blockers.length === 0
        ? "accepted-for-internal-processing"
        : "rejected",
    internalProcessingAccepted: blockers.length === 0,
    canonicalPublicBoundary: false,
    publicGeometryCreated: false,
    sourceGeometryPublished: false,
    supabaseAreaRowsCreated: false,
    limitations: [
      "layer reports survey year 2561",
      "small coordinate-level overlap is accepted only below the configured ratio",
      "technical acceptance does not make the geometry a field survey or a legal boundary determination",
      "raw geometry remains an ephemeral processing input and is not redistributed",
    ],
    blockers,
  },
};

if (process.argv.includes("--write-report")) {
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

console.log(
  JSON.stringify({
    datasetId: report.datasetId,
    status: report.acceptance.status,
    featureCount: report.qa.featureCount,
    invalidGeometryCount: report.qa.invalidDistrictCodes.length,
    overlapAreaRatio: report.qa.overlapAreaRatio,
    maxRelativeDeltaToAreaCal: report.qa.maxRelativeDeltaToAreaCal,
    resultChecksumSha256: report.qa.resultChecksumSha256,
    geometryPersisted: false,
    publicGeometryCreated: false,
    blockers,
  }),
);

if (blockers.length > 0) {
  process.exit(1);
}

function countVertices(coordinates) {
  if (!Array.isArray(coordinates)) {
    return 0;
  }
  if (
    coordinates.length >= 2
    && typeof coordinates[0] === "number"
    && typeof coordinates[1] === "number"
  ) {
    return 1;
  }
  return coordinates.reduce(
    (sum, child) => sum + countVertices(child),
    0,
  );
}

function countInteriorRings(geometry) {
  if (geometry?.type === "Polygon") {
    return Math.max(0, geometry.coordinates.length - 1);
  }
  if (geometry?.type === "MultiPolygon") {
    return geometry.coordinates.reduce(
      (sum, polygon) => sum + Math.max(0, polygon.length - 1),
      0,
    );
  }
  return 0;
}

function withinBounds(actual, envelope) {
  return (
    actual[0] >= envelope[0]
    && actual[1] >= envelope[1]
    && actual[2] <= envelope[2]
    && actual[3] <= envelope[3]
  );
}

function sameMembers(values, expected) {
  return (
    values.length === expected.length
    && [...values].sort().every((value, index) => value === expected[index])
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
