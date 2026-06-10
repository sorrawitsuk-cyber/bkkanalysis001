import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=][^=]*)=(.*)$/);
    if (!match) continue;
    process.env[match[1].trim()] = match[2].trim().replace(/^(['"])([\s\S]*)\1$/, "$2");
  }
}

loadEnv();

const apply = process.argv.includes("--apply");
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const { data: rows, error } = await supabase
  .from("district_statistics")
  .select("id, district_id, year, ntl_mean, ntl_max")
  .gte("year", 2024)
  .order("district_id")
  .order("year");

if (error) {
  console.error(error.message);
  process.exit(1);
}

const byDistrict = new Map();
for (const row of rows) {
  if (!byDistrict.has(row.district_id)) byDistrict.set(row.district_id, new Map());
  byDistrict.get(row.district_id).set(row.year, row);
}

const copiedRows = [];
for (const series of byDistrict.values()) {
  const observed = series.get(2024);
  if (!observed) continue;
  for (const year of [2025, 2026]) {
    const candidate = series.get(year);
    if (
      candidate &&
      candidate.ntl_mean === observed.ntl_mean &&
      candidate.ntl_max === observed.ntl_max
    ) {
      copiedRows.push(candidate);
    }
  }
}

console.log(`Copied VIIRS rows detected after 2024: ${copiedRows.length}`);
if (!apply) {
  console.log("Dry run only. Re-run with --apply to set ntl_mean and ntl_max to NULL.");
  process.exitCode = copiedRows.length > 0 ? 2 : 0;
} else if (copiedRows.length === 0) {
  console.log("No changes required.");
} else {
  const ids = copiedRows.map((row) => row.id);
  const { error: updateError } = await supabase
    .from("district_statistics")
    .update({ ntl_mean: null, ntl_max: null })
    .in("id", ids);

  if (updateError) {
    console.error(updateError.message);
    process.exitCode = 1;
  } else {
    console.log(`Cleared copied NTL values from ${ids.length} rows.`);
  }
}

await supabase.auth.signOut();
