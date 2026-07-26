import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE_PATH = resolve(ROOT, "src/data/bkk_districts.json");
const TARGET_PATH = resolve(
  ROOT,
  "src/data/observatory/bkk-districts.provisional.json",
);

const source = JSON.parse(await readFile(SOURCE_PATH, "utf8"));

if (source.type !== "FeatureCollection" || !Array.isArray(source.features)) {
  throw new Error("Legacy district geometry is not a GeoJSON FeatureCollection");
}

const features = source.features.map((feature, index) => {
  const legacyId = Number(feature.properties?.id);

  if (
    feature.type !== "Feature"
    || !feature.geometry
    || !Number.isInteger(legacyId)
    || typeof feature.properties?.name_th !== "string"
    || typeof feature.properties?.name_en !== "string"
  ) {
    throw new Error(`Invalid district feature at index ${index}`);
  }

  return {
    type: "Feature",
    geometry: feature.geometry,
    properties: {
      areaCode: `BKK-D${String(legacyId).padStart(2, "0")}`,
      legacyId,
      nameTh: feature.properties.name_th,
      nameEn: feature.properties.name_en,
      level: "district",
    },
  };
});

if (features.length !== 50) {
  throw new Error(`Expected 50 Bangkok districts, received ${features.length}`);
}

const areaCodes = new Set(features.map((feature) => feature.properties.areaCode));
if (areaCodes.size !== features.length) {
  throw new Error("Duplicate district areaCode in provisional geometry");
}

const output = `${JSON.stringify({
  type: "FeatureCollection",
  features,
})}\n`;

await mkdir(dirname(TARGET_PATH), { recursive: true });
await writeFile(TARGET_PATH, output, "utf8");

const checksum = createHash("sha256").update(output).digest("hex");
console.log(JSON.stringify({
  output: TARGET_PATH,
  featureCount: features.length,
  checksumSha256: checksum,
}));
