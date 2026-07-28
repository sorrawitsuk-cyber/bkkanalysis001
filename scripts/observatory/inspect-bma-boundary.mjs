import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REGISTRY_PATH = resolve(ROOT, "config/observatory/registry.json");
const REPORT_PATH = resolve(
  ROOT,
  "reports/observatory/bma-boundary-kml-inspection.json",
);

const registry = JSON.parse(await readFile(REGISTRY_PATH, "utf8"));
const dataset = registry.datasets.find(
  (item) => item.id === "bma-district-boundaries",
);
const resource = dataset?.resources?.find(
  (item) => item.id === "bma-district-kml",
);

if (!dataset || !resource) {
  throw new Error("BMA boundary dataset/resource is missing from registry");
}

if (dataset.acceptance.status === "validated") {
  throw new Error("Inspection script must be reviewed before use on a validated source");
}

const response = await fetch(resource.url, {
  headers: {
    Accept: "application/vnd.google-earth.kml+xml, application/xml;q=0.9",
    "User-Agent": "Bangkok-Urban-Earth-Observatory-RD/1.0",
  },
  redirect: "follow",
});

if (!response.ok) {
  throw new Error(`BMA boundary resource returned HTTP ${response.status}`);
}

const bytes = Buffer.from(await response.arrayBuffer());
const text = bytes.toString("utf8");
const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
const placemarkCount = (text.match(/<Placemark\b/gi) ?? []).length;
const embeddedGeometryCount = (
  text.match(/<(Polygon|MultiGeometry)\b/gi) ?? []
).length;
const networkLinkCount = (text.match(/<NetworkLink\b/gi) ?? []).length;
const hrefs = [...text.matchAll(/<href>([\s\S]*?)<\/href>/gi)]
  .map((match) => decodeXml(match[1].trim()))
  .filter(Boolean);
const networkLinkProtocols = [...new Set(hrefs.map((href) => {
  try {
    return new URL(href).protocol;
  } catch {
    return "invalid:";
  }
}))];
const networkLinkHosts = [...new Set(hrefs.map((href) => {
  try {
    return new URL(href).host;
  } catch {
    return "invalid";
  }
}))];

const blockers = [];
if (placemarkCount !== 50) {
  blockers.push(`expected 50 embedded placemarks, received ${placemarkCount}`);
}
if (embeddedGeometryCount === 0) {
  blockers.push("resource does not contain embedded Polygon or MultiGeometry elements");
}
if (networkLinkCount > 0) {
  blockers.push(`resource delegates geometry through ${networkLinkCount} NetworkLink element(s)`);
}
if (networkLinkProtocols.some((protocol) => protocol !== "https:")) {
  blockers.push(`NetworkLink uses non-HTTPS protocol: ${networkLinkProtocols.join(", ")}`);
}
if (
  dataset.license.status !== "verified"
  || dataset.license.redistribution !== "allowed"
) {
  blockers.push("license and redistribution permission are not verified");
}

const report = {
  reportSchemaVersion: "observatory-boundary-intake/v1",
  registryVersion: registry.registryVersion,
  datasetId: dataset.id,
  resourceId: resource.id,
  sourceUrl: resource.url,
  retrievedAt: new Date().toISOString(),
  http: {
    status: response.status,
    finalUrl: response.url,
    contentType: response.headers.get("content-type"),
    contentLengthBytes: bytes.length,
  },
  snapshot: {
    checksumSha256,
    sourcePersisted: false,
  },
  kmlInspection: {
    placemarkCount,
    embeddedGeometryCount,
    networkLinkCount,
    networkLinkProtocols,
    networkLinkHosts,
  },
  acceptance: {
    status: blockers.length === 0 ? "candidate" : "blocked",
    blockers,
    promotedToRuntime: false,
  },
};

if (process.argv.includes("--write-report")) {
  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify(report));

function decodeXml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'");
}
