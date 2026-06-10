import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=][^=]*)=(.*)$/);
    if (!match) continue;
    process.env[match[1].trim()] = match[2].trim().replace(/^(['"])([\s\S]*)\1$/, "$2");
  }
}

function countBy(rows, key) {
  const counts = new Map();
  for (const row of rows) {
    const value = row[key] ?? "(missing)";
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1]));
}

function range(rows, key) {
  const values = rows.map((row) => row[key]).filter((value) => typeof value === "number" && Number.isFinite(value));
  return values.length ? { count: values.length, min: Math.min(...values), max: Math.max(...values) } : { count: 0, min: null, max: null };
}

function countExactCarryForward(rows, key, fromYear, targetYears) {
  const byDistrict = new Map();
  for (const row of rows) {
    if (!byDistrict.has(row.district_id)) byDistrict.set(row.district_id, new Map());
    byDistrict.get(row.district_id).set(row.year, row[key]);
  }

  return [...byDistrict.values()].filter((series) => {
    const baseline = series.get(fromYear);
    return baseline != null && targetYears.every((year) => series.get(year) === baseline);
  }).length;
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Missing Supabase environment variables.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: rows, error } = await supabase
  .from("district_statistics")
  .select("*")
  .order("district_id")
  .order("year");

if (error) {
  console.error(error.message);
  process.exit(1);
}

const metrics = [
  "ndvi_mean",
  "ndbi_mean",
  "mean_lst",
  "water_ratio",
  "ntl_mean",
  "green_area_ratio",
  "no2_mean",
  "co_mean",
  "so2_mean",
  "pollution_score",
];

console.log(`Rows: ${rows.length}`);
console.log(`Districts: ${new Set(rows.map((row) => row.district_id)).size}`);
console.log(`Years: ${[...new Set(rows.map((row) => row.year))].sort().join(", ")}`);

console.log("\nRanges");
for (const metric of metrics) console.log(metric, range(rows, metric));

console.log("\nProvenance");
for (const keyName of ["ndvi_data_source", "ndbi_data_source", "air_quality_source"]) {
  console.log(keyName, countBy(rows, keyName));
}

console.log("\nCarry-forward checks");
console.log("ntl_mean 2024 copied unchanged to 2025 and 2026:", countExactCarryForward(rows, "ntl_mean", 2024, [2025, 2026]));
console.log("ntl_max 2024 copied unchanged to 2025 and 2026:", countExactCarryForward(rows, "ntl_max", 2024, [2025, 2026]));

const lstFallbackPath = path.join(process.cwd(), "src", "data", "lst_data.json");
if (fs.existsSync(lstFallbackPath)) {
  const fallbackRows = JSON.parse(fs.readFileSync(lstFallbackPath, "utf8"));
  const fallbackByKey = new Map(
    fallbackRows.map((row) => [`${row.district_name}|${row.year}`, row])
  );
  const { data: districts } = await supabase.from("districts").select("id, name_th");
  const nameById = new Map((districts ?? []).map((row) => [row.id, row.name_th]));
  const exactLstMatches = rows.filter((row) => {
    const fallback = fallbackByKey.get(`${nameById.get(row.district_id)}|${row.year}`);
    return fallback && fallback.mean_lst === row.mean_lst && fallback.max_lst === row.max_lst;
  }).length;
  console.log("\nLocal fallback checks");
  console.log("DB LST rows exactly matching generated lst_data.json:", exactLstMatches);
}

const invalid = {
  ndvi: rows.filter((row) => row.ndvi_mean != null && (row.ndvi_mean < -1 || row.ndvi_mean > 1)).length,
  ndbi: rows.filter((row) => row.ndbi_mean != null && (row.ndbi_mean < -1 || row.ndbi_mean > 1)).length,
  water: rows.filter((row) => row.water_ratio != null && (row.water_ratio < 0 || row.water_ratio > 1)).length,
  green: rows.filter((row) => row.green_area_ratio != null && (row.green_area_ratio < 0 || row.green_area_ratio > 1)).length,
  pollutionScore: rows.filter((row) => row.pollution_score != null && (row.pollution_score < 0 || row.pollution_score > 10)).length,
  ndviOrder: rows.filter((row) =>
    row.ndvi_min != null && row.ndvi_mean != null && row.ndvi_max != null &&
    !(row.ndvi_min <= row.ndvi_mean && row.ndvi_mean <= row.ndvi_max)
  ).length,
  ndbiOrder: rows.filter((row) =>
    row.ndbi_mean != null && row.ndbi_max != null && row.ndbi_mean > row.ndbi_max
  ).length,
  lstOrder: rows.filter((row) =>
    row.mean_lst != null && row.max_lst != null && row.mean_lst > row.max_lst
  ).length,
  ntlOrder: rows.filter((row) =>
    row.ntl_mean != null && row.ntl_max != null && row.ntl_mean > row.ntl_max
  ).length,
};
console.log("\nOut-of-range rows", invalid);

await supabase.auth.signOut();
