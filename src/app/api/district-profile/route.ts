/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase/server";
import geojson from "@/data/bkk_districts.json";
import * as turf from "@turf/turf";

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

function avgOf(rows: any[], key: string): number | null {
  const vals = rows
    .map((r) => r[key])
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const districtName = searchParams.get("district") ?? "";

  if (!districtName) {
    return NextResponse.json(
      { districts: allDistrictNames },
      { headers: { "Cache-Control": "public, s-maxage=86400" } }
    );
  }

  try {
    // Resolve district_id from geojson (district_statistics uses geojson IDs directly)
    const districtId = geoJsonIdByName.get(districtName);
    if (!districtId) {
      return NextResponse.json({ error: "ไม่พบเขต: " + districtName }, { status: 404 });
    }
    const areaRai = districtAreaRaiMap.get(districtId) ?? 0;

    // Fetch all years for this district + all rows for BKK averages in parallel
    const [{ data: distRows, error: distStatsErr }, { data: allRows, error: allErr }] =
      await Promise.all([
        supabase
          .from("district_statistics")
          .select(
            "year, mean_lst, max_lst, ndvi_mean, green_area_rai, green_area_ratio, ndbi_mean, no2_mean, co_mean, so2_mean, pollution_score, water_ratio, water_area_rai, ndwi_mean, ntl_mean, ntl_max"
          )
          .eq("district_id", districtId)
          .order("year", { ascending: true }),
        supabase
          .from("district_statistics")
          .select(
            "year, mean_lst, max_lst, ndvi_mean, green_area_rai, green_area_ratio, ndbi_mean, no2_mean, co_mean, so2_mean, pollution_score, water_ratio, water_area_rai, ndwi_mean, ntl_mean, ntl_max"
          )
          .order("year", { ascending: true }),
      ]);

    if (distStatsErr) throw new Error(distStatsErr.message);
    if (allErr) throw new Error(allErr.message);

    // BKK averages per year
    const bkkByYear: Record<number, any[]> = {};
    (allRows ?? []).forEach((r: any) => {
      if (!bkkByYear[r.year]) bkkByYear[r.year] = [];
      bkkByYear[r.year].push(r);
    });
    const bkkAverages: Record<number, any> = {};
    for (const [yr, rows] of Object.entries(bkkByYear)) {
      bkkAverages[Number(yr)] = {
        mean_lst: avgOf(rows, "mean_lst"),
        max_lst: avgOf(rows, "max_lst"),
        ndvi_mean: avgOf(rows, "ndvi_mean"),
        green_area_rai: avgOf(rows, "green_area_rai"),
        green_area_ratio: avgOf(rows, "green_area_ratio"),
        ndbi_mean: avgOf(rows, "ndbi_mean"),
        no2_mean: avgOf(rows, "no2_mean"),
        co_mean: avgOf(rows, "co_mean"),
        so2_mean: avgOf(rows, "so2_mean"),
        pollution_score: avgOf(rows, "pollution_score"),
        water_ratio: avgOf(rows, "water_ratio"),
        water_area_rai: null,
        ndwi_mean: avgOf(rows, "ndwi_mean"),
        ntl_mean: avgOf(rows, "ntl_mean"),
        ntl_max: avgOf(rows, "ntl_max"),
      };
    }

    // Build per-year metrics for the district
    const metrics: Record<number, any> = {};
    (distRows ?? []).forEach((row: any) => {
      const ndbi = typeof row.ndbi_mean === "number" ? row.ndbi_mean : null;
      const builtup_area_rai =
        ndbi !== null && areaRai > 0
          ? Math.round(Math.max(0, Math.min(1, (ndbi + 0.2) / 0.6)) * areaRai)
          : null;
      const waterRatio = row.water_ratio ?? null;
      // Prefer DB water_area_rai; fall back to exact computation using district's actual area
      const waterAreaRai = row.water_area_rai ??
        (waterRatio !== null && areaRai > 0 ? Math.round(waterRatio * areaRai) : null);
      metrics[row.year] = {
        mean_lst: row.mean_lst ?? null,
        max_lst: row.max_lst ?? null,
        ndvi_mean: row.ndvi_mean ?? null,
        green_area_rai: row.green_area_rai ?? null,
        green_area_ratio: row.green_area_ratio ?? null,
        ndbi_mean: row.ndbi_mean ?? null,
        builtup_area_rai,
        no2_mean: row.no2_mean ?? null,
        co_mean: row.co_mean ?? null,
        so2_mean: row.so2_mean ?? null,
        pollution_score: row.pollution_score ?? null,
        water_ratio: waterRatio,
        water_area_rai: waterAreaRai,
        ndwi_mean: row.ndwi_mean ?? null,
        ntl_mean: row.ntl_mean ?? null,
        ntl_max: row.ntl_max ?? null,
      };
    });

    // Compute BKK derived area fields per year (avg across districts, using selected district's area as reference)
    for (const avg of Object.values(bkkAverages)) {
      const ndbi = avg.ndbi_mean;
      avg.builtup_area_rai =
        ndbi !== null && areaRai > 0
          ? Math.round(Math.max(0, Math.min(1, (ndbi + 0.2) / 0.6)) * areaRai)
          : null;
      avg.water_area_rai =
        avg.water_ratio !== null && areaRai > 0
          ? Math.round((avg.water_ratio as number) * areaRai)
          : null;
    }

    const years = Object.keys(metrics).map(Number).sort();

    // Composite score per year (0–100, higher = better urban health):
    // NDVI 30%, LST inverse 25%, air quality inverse 20%, nightlights 15%, green area 10%
    const compositeScores: Record<number, number | null> = {};
    for (const yr of years) {
      const m = metrics[yr];
      const bkk = bkkAverages[yr];
      if (!m || !bkk) { compositeScores[yr] = null; continue; }

      const ndviScore   = m.ndvi_mean   !== null ? Math.min(100, (m.ndvi_mean / 0.5) * 100) : null;
      const lstScore    = m.mean_lst    !== null ? Math.max(0, 100 - ((m.mean_lst - 28) / 20) * 100) : null;
      const airScore    = m.no2_mean    !== null ? Math.max(0, 100 - (m.no2_mean / 0.0003) * 100) : null;
      const ntlScore    = m.ntl_mean    !== null
        // Inverse of NTL: very high light = poor "dark sky" score, but moderate = urban vitality
        // Use a balanced sigmoid approach: 30 nW is neutral
        ? Math.max(0, 100 - Math.abs(m.ntl_mean - 30) / 30 * 50) : null;
      const greenScore  = m.green_area_ratio !== null ? Math.min(100, m.green_area_ratio * 400) : null;

      const weights: [number | null, number][] = [
        [ndviScore,  0.30],
        [lstScore,   0.25],
        [airScore,   0.20],
        [ntlScore,   0.15],
        [greenScore, 0.10],
      ];
      const totalWeight = weights.filter(([v]) => v !== null).reduce((s, [, w]) => s + w, 0);
      if (totalWeight < 0.3) { compositeScores[yr] = null; continue; }
      const weighted = weights.filter(([v]) => v !== null).reduce((s, [v, w]) => s + (v as number) * w, 0);
      compositeScores[yr] = Math.round((weighted / totalWeight) * 10) / 10;
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
