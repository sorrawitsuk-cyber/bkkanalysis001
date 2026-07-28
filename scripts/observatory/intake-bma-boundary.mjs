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
import { XMLParser } from "fast-xml-parser";
import proj4 from "proj4";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REGISTRY_PATH = resolve(ROOT, "config/observatory/registry.json");
const REPORT_PATH = resolve(
  ROOT,
  "reports/observatory/bma-boundary-intake.json",
);
const DATASET_ID = "bma-district-boundaries";
const RESOURCE_ID = "bma-district-gml";
const EXPECTED_DISTRICT_CODES = Array.from(
  { length: 50 },
  (_, index) => String(1001 + index),
);
const UTM_47N =
  "+proj=utm +zone=47 +datum=WGS84 +units=m +no_defs +type=crs";
const WGS84 = "EPSG:4326";
const BANGKOK_BOUNDS = [100.25, 13.35, 101.0, 14.15];
const SOURCE_AREA_TOLERANCE = 0.001;

const registry = JSON.parse(await readFile(REGISTRY_PATH, "utf8"));
const dataset = registry.datasets.find((item) => item.id === DATASET_ID);
const resource = dataset?.resources?.find((item) => item.id === RESOURCE_ID);

if (!dataset || !resource) {
  throw new Error("BMA boundary GML resource is missing from the registry");
}

const sourcePath = getArgumentValue("--source");
const source = sourcePath
  ? {
      bytes: await readFile(resolve(sourcePath)),
      contentType: "application/gml+xml",
      finalUrl: resource.url,
      httpStatus: null,
      mode: "local-snapshot",
    }
  : await downloadSource(resource.url);

const checksumSha256 = createHash("sha256")
  .update(source.bytes)
  .digest("hex");
const xml = source.bytes.toString("utf8");
const parser = new XMLParser({
  attributeNamePrefix: "@_",
  ignoreAttributes: false,
  parseTagValue: false,
  removeNSPrefix: true,
  trimValues: true,
});
const document = parser.parse(xml);
const members = asArray(document.FeatureCollection?.featureMember);

const parsingErrors = [];
const sourceCrsValues = new Set();
const features = [];
const sourceAreas = [];

for (const [index, member] of members.entries()) {
  try {
    const district = member.district;
    if (!district) {
      throw new Error("missing district feature");
    }

    const districtCode = textValue(district.dcode);
    const nameTh = textValue(district.dname);
    const nameEn = textValue(district.dname_e);
    const sourceAreaSquareMeters = Number(textValue(district.AREA));
    const geometryNode = district.the_geom?.MultiPolygon;
    const sourceCrs = geometryNode?.["@_srsName"];

    if (!/^10\d{2}$/.test(districtCode)) {
      throw new Error(`invalid district code "${districtCode}"`);
    }
    if (!nameTh || !nameEn) {
      throw new Error("missing Thai or English district name");
    }
    if (!Number.isFinite(sourceAreaSquareMeters)) {
      throw new Error("invalid source AREA value");
    }
    if (!geometryNode || !sourceCrs) {
      throw new Error("missing MultiPolygon or CRS");
    }

    sourceCrsValues.add(sourceCrs);
    const utmCoordinates = asArray(geometryNode.polygonMember).map(
      (memberNode) => parsePolygon(memberNode.Polygon),
    );
    const coordinates = utmCoordinates.map((polygon) =>
      polygon.map((ring) =>
        ring.map(([easting, northing]) =>
          proj4(UTM_47N, WGS84, [easting, northing]),
        ),
      ),
    );
    const planarAreaSquareMeters = multiPolygonArea(utmCoordinates);

    sourceAreas.push({
      districtCode,
      sourceAreaSquareMeters,
      planarAreaSquareMeters,
      relativeDelta:
        Math.abs(planarAreaSquareMeters - sourceAreaSquareMeters) /
        sourceAreaSquareMeters,
    });
    features.push({
      type: "Feature",
      geometry: {
        type: "MultiPolygon",
        coordinates,
      },
      properties: {
        areaCode: `BKK-D${districtCode.slice(2)}`,
        officialDistrictCode: districtCode,
        nameTh,
        nameEn,
        level: "district",
      },
    });
  } catch (error) {
    parsingErrors.push({
      featureIndex: index,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

const districtCodes = features.map(
  (feature) => feature.properties.officialDistrictCode,
);
const areaCodes = features.map((feature) => feature.properties.areaCode);
const thaiNames = features.map((feature) => feature.properties.nameTh);
const englishNames = features.map((feature) => feature.properties.nameEn);
const invalidGeometryAreaCodes = features
  .filter((feature) => !booleanValid(feature))
  .map((feature) => feature.properties.areaCode);
const collection = featureCollection(features);
const collectionBounds = features.length > 0 ? bbox(collection) : null;
const boundsWithinBangkok =
  collectionBounds !== null &&
  collectionBounds[0] >= BANGKOK_BOUNDS[0] &&
  collectionBounds[1] >= BANGKOK_BOUNDS[1] &&
  collectionBounds[2] <= BANGKOK_BOUNDS[2] &&
  collectionBounds[3] <= BANGKOK_BOUNDS[3];
const sourceAreaDeltas = sourceAreas.map((item) => item.relativeDelta);
const maxSourceAreaRelativeDelta =
  sourceAreaDeltas.length > 0 ? Math.max(...sourceAreaDeltas) : null;
const meanSourceAreaRelativeDelta =
  sourceAreaDeltas.length > 0
    ? sourceAreaDeltas.reduce((sum, value) => sum + value, 0) /
      sourceAreaDeltas.length
    : null;
const totalFeatureAreaSquareMeters = features.reduce(
  (sum, feature) => sum + geodesicArea(feature),
  0,
);
const unionGeometry =
  features.length > 0 ? union(featureCollection(features)) : null;
const unionAreaSquareMeters = unionGeometry
  ? geodesicArea(unionGeometry)
  : null;
const overlapAreaEstimateSquareMeters =
  unionAreaSquareMeters === null
    ? null
    : Math.max(0, totalFeatureAreaSquareMeters - unionAreaSquareMeters);

const geometryBlockers = [];
if (members.length !== 50) {
  geometryBlockers.push(
    `expected 50 GML feature members, received ${members.length}`,
  );
}
if (features.length !== 50) {
  geometryBlockers.push(
    `expected 50 parsed district features, received ${features.length}`,
  );
}
if (!sameMembers(districtCodes, EXPECTED_DISTRICT_CODES)) {
  geometryBlockers.push("district codes do not match the complete 1001-1050 set");
}
if (!allUnique(areaCodes) || !allUnique(thaiNames) || !allUnique(englishNames)) {
  geometryBlockers.push("district codes or names are not unique");
}
if (
  sourceCrsValues.size !== 1 ||
  ![...sourceCrsValues][0]?.includes("32647")
) {
  geometryBlockers.push(
    `expected one EPSG:32647 CRS, received ${[...sourceCrsValues].join(", ")}`,
  );
}
if (!boundsWithinBangkok) {
  geometryBlockers.push("transformed bounds fall outside the Bangkok QA envelope");
}
if (invalidGeometryAreaCodes.length > 0) {
  geometryBlockers.push(
    `${invalidGeometryAreaCodes.length} district geometries failed boolean validity`,
  );
}
if (
  maxSourceAreaRelativeDelta === null ||
  maxSourceAreaRelativeDelta > SOURCE_AREA_TOLERANCE
) {
  geometryBlockers.push(
    `source AREA comparison exceeds ${SOURCE_AREA_TOLERANCE} relative tolerance`,
  );
}
if (
  overlapAreaEstimateSquareMeters !== null &&
  overlapAreaEstimateSquareMeters > 1
) {
  geometryBlockers.push(
    `estimated district overlap is ${overlapAreaEstimateSquareMeters.toFixed(3)} square meters`,
  );
}
if (parsingErrors.length > 0) {
  geometryBlockers.push(`${parsingErrors.length} GML features failed parsing`);
}

const licenseBlockers = [];
if (dataset.license.status !== "verified") {
  licenseBlockers.push(
    "dataset metadata says License not specified; reuse terms are not verified",
  );
}
if (dataset.license.redistribution !== "allowed") {
  licenseBlockers.push(
    "redistribution permission for source and derived geometry is not verified",
  );
}

const report = {
  reportSchemaVersion: "observatory-boundary-intake/v2",
  registryVersion: registry.registryVersion,
  datasetId: dataset.id,
  resourceId: resource.id,
  sourceUrl: resource.url,
  retrievedAt: new Date().toISOString(),
  source: {
    mode: source.mode,
    httpStatus: source.httpStatus,
    finalUrl: source.finalUrl,
    contentType: source.contentType,
    contentLengthBytes: source.bytes.length,
    checksumSha256,
    sourcePersisted: false,
    sourcePersistenceReason:
      "License and redistribution permission are not verified.",
  },
  schemaInspection: {
    featureMemberCount: members.length,
    parsedFeatureCount: features.length,
    sourceCrsValues: [...sourceCrsValues],
    sourceFieldsObserved: [
      "the_geom",
      "OBJECTID",
      "AREA",
      "dcode",
      "dname",
      "dname_e",
      "pcode",
      "pname",
      "num_male",
      "num_female",
      "num_school",
      "num_hos",
      "num_comm",
      "num_temple",
      "num_health",
    ],
    acceptedOutputProperties: [
      "areaCode",
      "officialDistrictCode",
      "nameTh",
      "nameEn",
      "level",
    ],
    excludedSourceProperties: [
      "OBJECTID",
      "AREA",
      "pcode",
      "pname",
      "num_male",
      "num_female",
      "num_school",
      "num_hos",
      "num_comm",
      "num_temple",
      "num_health",
    ],
  },
  geometryQa: {
    status: geometryBlockers.length === 0 ? "passed" : "failed",
    expectedDistrictCodes: "1001-1050",
    uniqueDistrictCodeCount: new Set(districtCodes).size,
    uniqueAreaCodeCount: new Set(areaCodes).size,
    uniqueThaiNameCount: new Set(thaiNames).size,
    uniqueEnglishNameCount: new Set(englishNames).size,
    invalidGeometryAreaCodes,
    transformedCrs: WGS84,
    bounds: collectionBounds,
    boundsWithinBangkok,
    sourceAreaTolerance: SOURCE_AREA_TOLERANCE,
    maxSourceAreaRelativeDelta,
    meanSourceAreaRelativeDelta,
    totalFeatureAreaSquareMeters,
    unionAreaSquareMeters,
    overlapAreaEstimateSquareMeters,
    unionGeometryType: unionGeometry?.geometry.type ?? null,
    parsingErrors,
    blockers: geometryBlockers,
  },
  acceptance: {
    status:
      geometryBlockers.length === 0 && licenseBlockers.length === 0
        ? "candidate"
        : "blocked",
    geometryAccepted: geometryBlockers.length === 0,
    licenseAccepted: licenseBlockers.length === 0,
    blockers: [...geometryBlockers, ...licenseBlockers],
    promotedToRuntime: false,
    seededToSupabase: false,
  },
};

if (process.argv.includes("--write-report")) {
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify(report));

async function downloadSource(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/gml+xml, application/xml;q=0.9",
      "User-Agent": "Bangkok-Urban-Earth-Observatory-RD/2.0",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`BMA GML resource returned HTTP ${response.status}`);
  }

  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type"),
    finalUrl: response.url,
    httpStatus: response.status,
    mode: "remote",
  };
}

function parsePolygon(polygonNode) {
  if (!polygonNode?.outerBoundaryIs?.LinearRing) {
    throw new Error("polygon is missing an outer ring");
  }

  const outerRing = parseRing(polygonNode.outerBoundaryIs.LinearRing);
  const innerRings = asArray(polygonNode.innerBoundaryIs).map((boundary) =>
    parseRing(boundary.LinearRing),
  );

  return [outerRing, ...innerRings];
}

function parseRing(linearRing) {
  const coordinateText = textValue(linearRing?.coordinates);
  const coordinates = coordinateText
    .split(/\s+/)
    .filter(Boolean)
    .map((pair) => {
      const [easting, northing] = pair.split(",").map(Number);
      if (!Number.isFinite(easting) || !Number.isFinite(northing)) {
        throw new Error(`invalid coordinate pair "${pair}"`);
      }
      return [easting, northing];
    });

  if (coordinates.length < 4) {
    throw new Error("linear ring has fewer than four coordinates");
  }

  const first = coordinates[0];
  const last = coordinates.at(-1);
  if (first[0] !== last[0] || first[1] !== last[1]) {
    coordinates.push([...first]);
  }

  return coordinates;
}

function multiPolygonArea(multiPolygonCoordinates) {
  return multiPolygonCoordinates.reduce(
    (multiPolygonSum, polygon) =>
      multiPolygonSum +
      Math.max(
        0,
        Math.abs(ringArea(polygon[0])) -
          polygon
            .slice(1)
            .reduce((holeSum, ring) => holeSum + Math.abs(ringArea(ring)), 0),
      ),
    0,
  );
}

function ringArea(coordinates) {
  let sum = 0;
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const [x1, y1] = coordinates[index];
    const [x2, y2] = coordinates[index + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

function textValue(value) {
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  if (value && typeof value === "object" && "#text" in value) {
    return String(value["#text"]).trim();
  }
  return "";
}

function asArray(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function allUnique(values) {
  return new Set(values).size === values.length;
}

function sameMembers(actual, expected) {
  return (
    actual.length === expected.length &&
    [...actual].sort().every((value, index) => value === [...expected].sort()[index])
  );
}

function getArgumentValue(name) {
  const prefix = `${name}=`;
  const argument = process.argv.find((item) => item.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : null;
}
