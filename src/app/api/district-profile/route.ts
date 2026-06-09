/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase/server";
import geojson from "@/data/bkk_districts.json";
import * as turf from "@turf/turf";

// Module-level lookups built from static GeoJSON — never change between requests
const districtAreaRaiMap = new Map<number, number>(
  (geojson.features as any[]).map((f: any) => [
    f.properties.id,
    Math.round(turf.area(f) / 1600),
  ])
);

const geoJsonIdByName = new Map<string, number>(
  (geojson.features as any[]).map((f: any) => [f.properties.name_th as string, f.properties.id as number])
);

const allDistrictNames: string[] = (geojson.features as any[])
  .map((f: any) => f.properties.name_th as string)
  .sort((a, b) => a.localeCompare(b, "th"));

// ─── composite score (0–100): NDVI 30%, LST 25%, air 20%, NTL 15%, green 10% ─
function computeCompositeScore(m: any): number | null {
  const ndviScore  = m.ndvi_mean   != null ? Math.min(100, (m.ndvi_mean / 0.5) * 100) : null;
  const lstScore   = m.mean_lst    != null ? Math.max(0, 100 - ((m.mean_lst - 28) / 20) * 100) : null;
  const airScore   = m.no2_mean    != null ? Math.max(0, 100 - (m.no2_mean / 0.0003) * 100) : null;
  const ntlScore   = m.ntl_mean    != null ? Math.max(0, 100 - Math.abs(m.ntl_mean - 30) / 30 * 50) : null;
  const greenScore = m.green_area_ratio != null ? Math.min(100, m.green_area_ratio * 400) : null;

  const pairs: [number | null, number][] = [
    [ndviScore, 0.30], [lstScore, 0.25], [airScore, 0.20], [ntlScore, 0.15], [greenScore, 0.10],
  ];
  const totalW = pairs.filter(([v]) => v != null).reduce((s, [, w]) => s + w, 0);
  if (totalW < 0.3) return null;
  const weighted = pairs.filter(([v]) => v != null).reduce((s, [v, w]) => s + (v as number) * w, 0);
  return Math.round((weighted / totalW) * 10) / 10;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const districtName = searchParams.get("district") ?? "";

  // List endpoint — return all district names for selectors
  if (!districtName) {
    return NextResponse.json(
      { districts: allDistrictNames },
      { headers: { "Cache-Control": "public, s-maxage=86400" } }
    );
  }

  try {
    // GeoJSON id is used only for area and feature lookup (districtAreaRaiMap is keyed by GeoJSON id)
    const geoId = geoJsonIdByName.get(districtName);
    if (!geoId) {
      return NextResponse.json({ error: "ไม่พบเขต: " + districtName }, { status: 404 });
    }
    const areaRai = districtAreaRaiMap.get(geoId) ?? 0;

    // Supabase districts.id may differ from GeoJSON id (auto-increment vs GeoJSON ordering).
    // The RPC queries district_statistics.district_id which references districts.id — must use Supabase id.
    const { data: sbDist } = await supabase
      .from("districts")
      .select("id")
      .or(`name_th.eq.${districtName},name_th.eq.เขต${districtName}`)
      .limit(1);
    const districtId = sbDist?.[0]?.id ?? geoId;

    // ── Single RPC call: district rows + BKK averages in one round-trip ──────
    // Replaces 2 separate queries (1 district + 450-row full scan).
    // get_district_profile returns row_type = 'district' | 'bkk_avg'
    const { data: rpcRows, error: rpcErr } = await supabase
      .rpc("get_district_profile", { p_district_id: districtId });

    if (rpcErr) throw new Error(rpcErr.message);

    const districtRows = (rpcRows ?? []).filter((r: any) => r.row_type === "district");
    const bkkAvgRows   = (rpcRows ?? []).filter((r: any) => r.row_type === "bkk_avg");

    // ── Build per-year metrics map for the district ───────────────────────────
    const metrics: Record<number, any> = {};
    for (const row of districtRows) {
      const ndbi = typeof row.ndbi_mean === "number" ? row.ndbi_mean : null;
      const builtup_area_rai =
        ndbi !== null && areaRai > 0
          ? Math.round(Math.max(0, Math.min(1, (ndbi + 0.2) / 0.6)) * areaRai)
          : null;

      // Prefer DB water_area_rai; fall back to exact computation
      const waterAreaRai =
        row.water_area_rai != null
          ? Math.round(row.water_area_rai)
          : row.water_ratio != null && areaRai > 0
            ? Math.round(row.water_ratio * areaRai)
            : null;

      metrics[row.year] = {
        mean_lst:         row.mean_lst         ?? null,
        max_lst:          row.max_lst          ?? null,
        ndvi_mean:        row.ndvi_mean        ?? null,
        ndvi_score:       row.ndvi_score       ?? null,
        green_area_rai:   row.green_area_rai   != null ? Math.round(row.green_area_rai) : null,
        green_area_ratio: row.green_area_ratio ?? null,
        low_green_ratio:  row.low_green_ratio  ?? null,
        ndbi_mean:        row.ndbi_mean        ?? null,
        ndbi_max:         row.ndbi_max         ?? null,
        builtup_area_rai,
        no2_mean:         row.no2_mean         ?? null,
        no2_max:          row.no2_max          ?? null,
        co_mean:          row.co_mean          ?? null,
        co_max:           row.co_max           ?? null,
        so2_mean:         row.so2_mean         ?? null,
        so2_max:          row.so2_max          ?? null,
        aerosol_index_mean: row.aerosol_index_mean ?? null,
        aerosol_index_max:  row.aerosol_index_max  ?? null,
        pollution_score:  row.pollution_score  ?? null,
        water_ratio:      row.water_ratio      ?? null,
        water_area_rai:   waterAreaRai,
        ndwi_mean:        row.ndwi_mean        ?? null,
        ntl_mean:         row.year <= 2024 ? (row.ntl_mean ?? null) : null,
        ntl_max:          row.year <= 2024 ? (row.ntl_max ?? null) : null,
      };
    }

    // ── BKK averages from the pre-aggregated materialized view ────────────────
    const bkkAverages: Record<number, any> = {};
    for (const row of bkkAvgRows) {
      const ndbi = typeof row.ndbi_mean === "number" ? row.ndbi_mean : null;
      bkkAverages[row.year] = {
        mean_lst:         row.mean_lst         ?? null,
        max_lst:          row.max_lst          ?? null,
        ndvi_mean:        row.ndvi_mean        ?? null,
        ndvi_score:       row.ndvi_score       ?? null,
        green_area_rai:   row.green_area_rai   != null ? Math.round(row.green_area_rai) : null,
        green_area_ratio: row.green_area_ratio ?? null,
        low_green_ratio:  row.low_green_ratio  ?? null,
        ndbi_mean:        row.ndbi_mean        ?? null,
        ndbi_max:         row.ndbi_max         ?? null,
        builtup_area_rai:
          ndbi !== null && areaRai > 0
            ? Math.round(Math.max(0, Math.min(1, (ndbi + 0.2) / 0.6)) * areaRai)
            : null,
        no2_mean:         row.no2_mean         ?? null,
        co_mean:          row.co_mean          ?? null,
        so2_mean:         row.so2_mean         ?? null,
        aerosol_index_mean: row.aerosol_index_mean ?? null,
        pollution_score:  row.pollution_score  ?? null,
        water_ratio:      row.water_ratio      ?? null,
        water_area_rai:
          row.water_area_rai != null
            ? Math.round(row.water_area_rai)
            : row.water_ratio != null && areaRai > 0
              ? Math.round(row.water_ratio * areaRai)
              : null,
        ndwi_mean:        row.ndwi_mean        ?? null,
        ntl_mean:         row.year <= 2024 ? (row.ntl_mean ?? null) : null,
        ntl_max:          row.year <= 2024 ? (row.ntl_max ?? null) : null,
      };
    }

    const years = Object.keys(metrics).map(Number).sort();

    // ── Composite score per year ──────────────────────────────────────────────
    const compositeScores: Record<number, number | null> = {};
    for (const yr of years) {
      compositeScores[yr] = metrics[yr] ? computeCompositeScore(metrics[yr]) : null;
    }

    return NextResponse.json(
      { district: districtName, areaRai, years, metrics, bkkAverages, compositeScores },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=1800" } }
    );
  } catch (err: any) {
    console.error("district-profile error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
