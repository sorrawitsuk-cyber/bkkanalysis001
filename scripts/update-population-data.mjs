import fs from "node:fs/promises";
import path from "node:path";
import area from "@turf/area";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUTPUT = path.join(ROOT, "src", "data", "bkk_population.json");
const SUBDISTRICTS = path.join(ROOT, "src", "data", "bkk_subdistricts.json");
const START_YEAR = 2018;
const END_YEAR = 2025;
const BUDDHIST_YEAR_OFFSET = 543;

function normalizeName(value, prefix) {
  return String(value || "").trim().replace(prefix, "");
}

function parseNumber(value) {
  return Number(String(value || "0").replaceAll(",", "")) || 0;
}

async function fetchYear(year) {
  const shortYear = year + BUDDHIST_YEAR_OFFSET - 2500;
  const url = `https://stat.bora.dopa.go.th/new_stat/file/${shortYear}/stat_t${shortYear}.txt`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`DOPA ${year} download failed: ${response.status}`);
  const text = await response.text();

  const rows = text
    .split(/\r?\n/)
    .map((line) => line.split("|"))
    .filter((columns) =>
      columns[1] === "10" &&
      columns[5] &&
      columns[5] !== "0" &&
      columns[6]?.trim()
    )
    .map((columns) => ({
      year,
      district_name: normalizeName(columns[4], /^ท้องถิ่นเขต/),
      name: columns[6].trim(),
      dopa_code: columns[5],
      male: parseNumber(columns[9]),
      female: parseNumber(columns[10]),
      population: parseNumber(columns[11]),
      houses: parseNumber(columns[12]),
    }));

  if (rows.length < 180) {
    throw new Error(`DOPA ${year}: expected at least 180 subdistrict rows, received ${rows.length}`);
  }
  return rows;
}

const geojson = JSON.parse(await fs.readFile(SUBDISTRICTS, "utf8"));
const annualRows = (await Promise.all(
  Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, index) => fetchYear(START_YEAR + index)),
)).flat();
const rowsByKey = new Map();

for (const row of annualRows) {
  const key = `${row.district_name}|${row.name}`;
  if (!rowsByKey.has(key)) rowsByKey.set(key, []);
  rowsByKey.get(key).push(row);
}

const subdistricts = geojson.features.map((feature) => {
  const properties = feature.properties;
  const name = normalizeName(properties.name_th, /^แขวง/);
  const key = `${properties.district_name}|${name}`;
  const records = (rowsByKey.get(key) || []).sort((a, b) => a.year - b.year);

  if (records.length !== END_YEAR - START_YEAR + 1) {
    throw new Error(`${key}: expected ${END_YEAR - START_YEAR + 1} annual records, received ${records.length}`);
  }
  for (const record of records) {
    if (record.population !== record.male + record.female) {
      throw new Error(`${key} ${record.year}: male + female does not equal population`);
    }
  }

  return {
    id: properties.id,
    district_id: properties.district_id,
    district_name: properties.district_name,
    name_th: properties.name_th,
    name_en: properties.name_en,
    dopa_code: records.at(-1).dopa_code,
    area_km2: Number((area(feature) / 1_000_000).toFixed(4)),
    records: records.map(({ year, male, female, population, houses }) => ({
      year,
      male,
      female,
      population,
      houses,
    })),
  };
});

const districtCount = new Set(subdistricts.map((row) => row.district_id)).size;
if (subdistricts.length !== 180 || districtCount !== 50) {
  throw new Error(`Boundary match failed: ${subdistricts.length} subdistricts, ${districtCount} districts`);
}

const payload = {
  metadata: {
    min_year: START_YEAR,
    max_year: END_YEAR,
    latest_period: "December 2025",
    population_source: "Bureau of Registration Administration, Department of Provincial Administration",
    population_source_th: "สำนักบริหารการทะเบียน กรมการปกครอง",
    population_source_url: "https://stat.bora.dopa.go.th/new_stat/webPage/statByYear.php",
    boundary_source: "OpenStreetMap administrative boundaries stored in src/data/bkk_subdistricts.json",
    processing_note: "ประชากรชาย หญิง รวม และจำนวนบ้านเป็นสถิติทะเบียนราษฎรเดือนธันวาคมของแต่ละปี พื้นที่คำนวณจาก polygon ที่ใช้แสดงบนแผนที่",
  },
  subdistricts,
};

await fs.writeFile(OUTPUT, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Wrote ${subdistricts.length} subdistricts (${START_YEAR}-${END_YEAR}) to ${OUTPUT}`);
