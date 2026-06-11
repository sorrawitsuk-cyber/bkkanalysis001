const baseUrl = process.argv[2] || "http://127.0.0.1:3000";
const baseline = Number.parseInt(process.env.LAND_COVER_BASELINE || "2020", 10);
const year = Number.parseInt(process.env.LAND_COVER_YEAR || "2025", 10);
const endpoint = new URL("/api/land-cover-change", baseUrl);
endpoint.searchParams.set("baseline", String(baseline));
endpoint.searchParams.set("year", String(year));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertPercentage(value, label) {
  assert(
    value === null || (Number.isFinite(value) && value >= 0 && value <= 100),
    `${label} must be null or between 0 and 100`,
  );
}

const response = await fetch(endpoint, {
  headers: { Accept: "application/json" },
  signal: AbortSignal.timeout(10 * 60 * 1000),
});
const body = await response.json();

assert(response.ok, `Land Cover API returned ${response.status}: ${body?.error || "unknown error"}`);
assert(body?.period?.baselineYear === baseline, "baseline year does not match the request");
assert(body?.period?.year === year, "current year does not match the request");
assert(Array.isArray(body.rows) && body.rows.length === 50, "expected exactly 50 district rows");
assert(new Set(body.rows.map((row) => row.district_id)).size === 50, "district IDs must be unique");
assert(body.geojson?.type === "FeatureCollection", "GeoJSON must be a FeatureCollection");
assert(body.geojson?.features?.length === 50, "expected exactly 50 district geometries");

for (const row of body.rows) {
  assert(Number.isInteger(row.district_id), "district_id must be an integer");
  assert(typeof row.district_name === "string" && row.district_name.length > 0, "district_name is required");

  for (const key of [
    "green_pct",
    "built_pct",
    "water_pct",
    "bare_pct",
    "green_to_built_pct",
    "built_to_green_pct",
    "changed_pct",
    "confidence_pct",
    "coverage_pct",
  ]) {
    assertPercentage(row[key], `${row.district_name}.${key}`);
  }

  if (row.green_to_built_pct !== null && row.changed_pct !== null) {
    assert(
      row.green_to_built_pct <= row.changed_pct + 0.01,
      `${row.district_name}: green_to_built_pct exceeds changed_pct`,
    );
  }
  if (row.built_to_green_pct !== null && row.changed_pct !== null) {
    assert(
      row.built_to_green_pct <= row.changed_pct + 0.01,
      `${row.district_name}: built_to_green_pct exceeds changed_pct`,
    );
  }
}

for (const layer of ["change", "current", "baseline"]) {
  assert(
    typeof body.rasters?.[layer]?.urlFormat === "string" &&
      body.rasters[layer].urlFormat.includes("{z}") &&
      body.rasters[layer].urlFormat.includes("{x}") &&
      body.rasters[layer].urlFormat.includes("{y}"),
    `${layer} raster URL is missing or invalid`,
  );
}

assert(body.summary?.source === "Google Dynamic World V1", "unexpected data source");
assert(body.summary.currentSceneCount > 0, "current year must contain Dynamic World scenes");
assert(body.summary.baselineSceneCount > 0, "baseline year must contain Dynamic World scenes");

console.log(JSON.stringify({
  ok: true,
  baseline,
  year,
  districts: body.rows.length,
  currentSceneCount: body.summary.currentSceneCount,
  baselineSceneCount: body.summary.baselineSceneCount,
  averageCoveragePct: body.summary.averageCoveragePct,
  averageConfidencePct: body.summary.averageConfidencePct,
}, null, 2));
