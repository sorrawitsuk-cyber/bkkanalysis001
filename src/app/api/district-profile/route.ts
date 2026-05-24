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
    // Resolve district_id from districts table
    const { data: districtRow, error: distErr } = await supabase
      .from("districts")
      .select("id")
      .eq("name_th", districtName)
      .single();

    if (distErr || !districtRow) {
      return NextResponse.json({ error: "ไม่พบเขต: " + districtName }, { status: 404 });
    }

    const districtId: number = districtRow.id;
    const geoId = geoJsonIdByName.get(districtName);
    const areaRai = geoId ? (districtAreaRaiMap.get(geoId) ?? 0) : 0;

    // Fetch all years for this district + all rows for BKK averages in parallel
    const [{ data: distRows, error: distStatsErr }, { data: allRows, error: allErr }] =
      await Promise.all([
        supabase
          .from("district_statistics")
          .select(
            "year, mean_lst, max_lst, ndvi_mean, green_area_rai, green_area_ratio, ndbi_mean, ndbi_max, no2_mean, co_mean, so2_mean, pollution_score, water_ratio, water_area_rai, ndwi_mean, ntl_mean, ntl_max"
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
        water_area_rai: avgOf(rows, "water_area_rai"),
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
        water_ratio: row.water_ratio ?? null,
        water_area_rai: row.water_area_rai ?? null,
        ndwi_mean: row.ndwi_mean ?? null,
        ntl_mean: row.ntl_mean ?? null,
        ntl_max: row.ntl_max ?? null,
      };
    });

    // Compute BKK built-up area per year using the same formula (avg across districts)
    for (const [yr, avg] of Object.entries(bkkAverages)) {
      const ndbi = avg.ndbi_mean;
      avg.builtup_area_rai =
        ndbi !== null && areaRai > 0
          ? Math.round(Math.max(0, Math.min(1, (ndbi + 0.2) / 0.6)) * areaRai)
          : null;
    }

    const years = Object.keys(metrics).map(Number).sort();

    return NextResponse.json(
      { district: districtName, areaRai, years, metrics, bkkAverages },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=1800" } }
    );
  } catch (err: any) {
    console.error("district-profile error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
