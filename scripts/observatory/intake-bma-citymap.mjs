import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REGISTRY_PATH = resolve(ROOT, "config/observatory/registry.json");
const REPORT_PATH = resolve(
  ROOT,
  "reports/observatory/bma-citymap-service-intake.json",
);
const DATASET_ID = "bma-citymap-basemap";
const MAPSERVER_RESOURCE_ID = "citymap-arcgis-mapserver";
const WMS_RESOURCE_ID = "citymap-wms";
const DISTRICT_LAYER_ID = 13;
const EXPECTED_CODES = Array.from(
  { length: 50 },
  (_, index) => String(1001 + index),
);

const registry = JSON.parse(await readFile(REGISTRY_PATH, "utf8"));
const dataset = registry.datasets.find((item) => item.id === DATASET_ID);
const mapServerResource = dataset?.resources?.find(
  (item) => item.id === MAPSERVER_RESOURCE_ID,
);
const wmsResource = dataset?.resources?.find(
  (item) => item.id === WMS_RESOURCE_ID,
);

if (!dataset || !mapServerResource || !wmsResource) {
  throw new Error("Bangkok CityMap resources are missing from the registry");
}

const serviceUrl = `${mapServerResource.url}?f=pjson`;
const layerUrl = `${mapServerResource.url}/${DISTRICT_LAYER_ID}?f=pjson`;
const attributeQueryUrl = new URL(
  `${mapServerResource.url}/${DISTRICT_LAYER_ID}/query`,
);
attributeQueryUrl.search = new URLSearchParams({
  where: "1=1",
  outFields: "OBJECTID,DISTRICT_I,DISTRICT_N,UPDATE_YEAR,CODE",
  returnGeometry: "false",
  orderByFields: "DISTRICT_I",
  f: "json",
}).toString();
const wmsCapabilitiesUrl = new URL(wmsResource.url);
wmsCapabilitiesUrl.search = new URLSearchParams({
  service: "WMS",
  request: "GetCapabilities",
}).toString();

const [serviceResponse, layerResponse, attributeResponse, wmsResponse] =
  await Promise.all([
    fetchText(serviceUrl),
    fetchText(layerUrl),
    fetchText(attributeQueryUrl),
    fetchText(wmsCapabilitiesUrl),
  ]);
const service = JSON.parse(serviceResponse.text);
const districtLayer = JSON.parse(layerResponse.text);
const attributePayload = JSON.parse(attributeResponse.text);
const districtAttributes = (attributePayload.features ?? []).map(
  (feature) => feature.attributes,
);
const districtCodes = districtAttributes.map((item) => item.DISTRICT_I);
const surveyYears = [
  ...new Set(districtAttributes.map((item) => item.UPDATE_YEAR)),
].sort();
const wmsCrs = [
  ...new Set(
    [...wmsResponse.text.matchAll(/<CRS>(.*?)<\/CRS>/g)].map(
      (match) => match[1],
    ),
  ),
];
const wmsLayerIds = [
  ...new Set(
    [...wmsResponse.text.matchAll(/<Name>(\d+)<\/Name>/g)].map(
      (match) => Number(match[1]),
    ),
  ),
].sort((left, right) => left - right);

const mapSmokeUrl = new URL(wmsResource.url);
mapSmokeUrl.search = new URLSearchParams({
  service: "WMS",
  request: "GetMap",
  version: "1.3.0",
  layers: service.layers.map((layer) => layer.id).join(","),
  styles: "",
  format: "image/png",
  transparent: "false",
  crs: "EPSG:4326",
  bbox: "13.48,100.32,13.96,100.94",
  width: "512",
  height: "512",
}).toString();
const mapSmoke = await fetchBytes(mapSmokeUrl);
const serviceMetadataChecksumSha256 = sha256(serviceResponse.text);
const wmsCapabilitiesChecksumSha256 = sha256(wmsResponse.text);

const blockers = [];
if (service.mapName !== "Basemap1000_4326_H") {
  blockers.push(`unexpected map name ${service.mapName}`);
}
if (service.spatialReference?.latestWkid !== 4326) {
  blockers.push("service spatial reference is not EPSG:4326");
}
for (const capability of ["Map", "Query", "Data"]) {
  if (!service.capabilities?.split(",").includes(capability)) {
    blockers.push(`service does not advertise ${capability} capability`);
  }
}
if (service.layers?.length !== 15) {
  blockers.push(`expected 15 map layers, received ${service.layers?.length}`);
}
if (
  districtLayer.id !== DISTRICT_LAYER_ID
  || districtLayer.geometryType !== "esriGeometryPolygon"
) {
  blockers.push("layer 13 is not the expected district polygon layer");
}
if (!sameMembers(districtCodes, EXPECTED_CODES)) {
  blockers.push("district codes do not match the complete 1001-1050 set");
}
if (!wmsCrs.includes("EPSG:4326") || wmsLayerIds.length !== 15) {
  blockers.push("WMS capabilities do not expose all layers in EPSG:4326");
}
if (
  mapSmoke.contentType !== "image/png"
  || mapSmoke.bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
) {
  blockers.push("WMS GetMap smoke response is not a PNG image");
}

const attributeManifest = districtAttributes.map((item) => ({
  districtCode: item.DISTRICT_I,
  districtNameTh: item.DISTRICT_N,
  surveyYearBuddhist: item.UPDATE_YEAR,
}));
const attributeManifestChecksumSha256 = sha256(
  JSON.stringify(attributeManifest),
);
const versionManifestChecksumSha256 = sha256(
  JSON.stringify({
    datasetId: dataset.id,
    mapName: service.mapName,
    serviceVersion: service.currentVersion,
    serviceMetadataChecksumSha256,
    wmsCapabilitiesChecksumSha256,
    attributeManifestChecksumSha256,
  }),
);
const report = {
  reportSchemaVersion: "observatory-public-map-service-intake/v1",
  registryVersion: registry.registryVersion,
  datasetId: dataset.id,
  inspectedAt: new Date().toISOString(),
  service: {
    mapName: service.mapName,
    currentVersion: service.currentVersion,
    capabilities: service.capabilities.split(","),
    singleFusedMapCache: service.singleFusedMapCache,
    spatialReference: `EPSG:${service.spatialReference.latestWkid}`,
    fullExtent: [
      service.fullExtent.xmin,
      service.fullExtent.ymin,
      service.fullExtent.xmax,
      service.fullExtent.ymax,
    ],
    layerCount: service.layers.length,
    restUrl: mapServerResource.url,
    metadataChecksumSha256: serviceMetadataChecksumSha256,
    copyrightTextDeclared: Boolean(service.copyrightText?.trim()),
  },
  wms: {
    url: wmsResource.url,
    version: "1.3.0",
    supportedCrs: wmsCrs,
    layerIds: wmsLayerIds,
    capabilitiesChecksumSha256: wmsCapabilitiesChecksumSha256,
    getMapSmokeStatus: mapSmoke.status,
    getMapContentType: mapSmoke.contentType,
    getMapBytes: mapSmoke.bytes.length,
  },
  districtLayer: {
    id: districtLayer.id,
    name: districtLayer.name,
    geometryType: districtLayer.geometryType,
    queryFormats: districtLayer.supportedQueryFormats.split(", "),
    recordCount: districtAttributes.length,
    completeOfficialCodeSet: sameMembers(
      districtCodes,
      EXPECTED_CODES,
    ),
    surveyYearsBuddhist: surveyYears,
    attributeManifestChecksumSha256,
    geometryQueried: false,
    geometryPersisted: false,
  },
  version: {
    versionLabel:
      `citymap-${service.currentVersion}-district-y${surveyYears.join("-")}-`
      + versionManifestChecksumSha256.slice(0, 12),
    manifestChecksumSha256: versionManifestChecksumSha256,
    schemaVersion: "bma-citymap-service-manifest/v1",
    sourceSnapshotUri: mapServerResource.url,
    acceptanceStatus: "research",
  },
  consumptionPolicy: {
    status:
      blockers.length === 0
        ? "accepted-for-direct-basemap"
        : "rejected",
    directExternalRequestsOnly: true,
    proxyEnabled: false,
    sourceSnapshotPersisted: false,
    analyticalGeometryAccepted: false,
    sourceRepublicationAllowed: false,
    role: "contextual-basemap-only",
    attribution: "กรุงเทพมหานคร · Bangkok CityMap",
    limitations: [
      "service metadata does not declare reuse or redistribution terms",
      "district layer reports survey year 2561",
      "service availability and rendering may change outside this application",
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
    status: report.consumptionPolicy.status,
    layerCount: report.service.layerCount,
    districtRecordCount: report.districtLayer.recordCount,
    surveyYearsBuddhist: report.districtLayer.surveyYearsBuddhist,
    blockers,
  }),
);

if (blockers.length > 0) {
  process.exit(1);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "Bangkok-Urban-Earth-Observatory/1.0" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status}`);
  }
  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    text: await response.text(),
  };
}

async function fetchBytes(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "Bangkok-Urban-Earth-Observatory/1.0" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status}`);
  }
  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    bytes: Buffer.from(await response.arrayBuffer()),
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sameMembers(values, expected) {
  return (
    values.length === expected.length
    && [...values].sort().every((value, index) => value === expected[index])
  );
}
