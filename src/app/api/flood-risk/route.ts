/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import * as turf from "@turf/turf";
import geojson from "@/data/bkk_districts.json";
import { supabaseServer as supabase } from "@/lib/supabase/server";
import type { DistrictStatistic } from "@/types/district";

export const dynamic = "force-dynamic";

const ALL_DISTRICTS = "ทั้งหมด";

// District area in rai (1 rai = 1,600 m²) — computed once from GeoJSON
const districtAreaRaiMap = new Map<number, number>(
  (geojson.features as any[]).map((f: any) => [
    f.properties.id,
    Math.round(turf.area(f) / 1600),
  ])
);

async function loadDbRows(year: number): Promise<DistrictStatistic[]> {
  const { data, error } = await supabase
    .from("district_statistics")
    .select("district_id, district_name, year, water_ratio")
    .eq("year", year);
  if (error || !data || data.length === 0) return [];
  return data as DistrictStatistic[];
}

async function loadAllDbRows(): Promise<DistrictStatistic[]> {
  const { data, error } = await supabase
    .from("district_statistics")
    .select("district_id, district_name, year, water_ratio")
    .order("year", { ascending: true });
  if (error || !data || data.length === 0) return [];
  return data as DistrictStatistic[];
}

function hasWaterData(rows: DistrictStatistic[]): boolean {
  return rows.some((r) => typeof r.water_ratio === "number");
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get("year") || "2024", 10);
    const districtFilter = searchParams.get("district");
    const compareYearStr = searchParams.get("compareYear");
    const compareYear = compareYearStr ? parseInt(compareYearStr, 10) : null;

    // Inverted mask for areas outside Bangkok
    let invertedMask = null;
    try {
      let bkkPolygon: any = geojson.features[0];
      for (let i = 1; i < geojson.features.length; i++) {
        bkkPolygon = turf.union(turf.featureCollection([bkkPolygon, geojson.features[i]]));
      }
      invertedMask = turf.mask(bkkPolygon);
    } catch (e) {
      console.error("Mask generation failed:", e);
    }

    // Build id↔name maps
    const districtNameById = new Map<number, string>();
    const geoJsonIdByName = new Map<string, number>();
    geojson.features.forEach((f: any) => {
      districtNameById.set(f.properties.id, f.properties.name_th);
      geoJsonIdByName.set(f.properties.name_th, f.properties.id);
    });

    // Remap Supabase district_id → GeoJSON feature id
    const geoJsonIdBySupabaseId = new Map<number, number>();
    try {
      const { data: supabaseDistricts } = await supabase.from("districts").select("id, name_th");
      if (supabaseDistricts) {
        supabaseDistricts.forEach((d: any) => {
          const geoId = geoJsonIdByName.get(d.name_th);
          if (geoId !== undefined) geoJsonIdBySupabaseId.set(d.id, geoId);
        });
      }
    } catch (_e) { /* fall through */ }

    function normalizeRows(rows: any[]): any[] {
      if (geoJsonIdBySupabaseId.size === 0) return rows;
      return rows.map((row) => {
        const geoId = geoJsonIdBySupabaseId.get(row.district_id);
        if (geoId === undefined) return row;
        return { ...row, district_id: geoId, district_name: districtNameById.get(geoId) ?? row.district_name };
      });
    }

    const dbYearRows = normalizeRows(await loadDbRows(year));
    const dbCompareRows = compareYear ? normalizeRows(await loadDbRows(compareYear)) : [];
    const dbAllRows = normalizeRows(await loadAllDbRows());

    const useDb = hasWaterData(dbYearRows);

    const yearMap = new Map<number, any>();
    dbYearRows.forEach((r) => yearMap.set(r.district_id, r));
    const compareMap = new Map<number, any>();
    dbCompareRows.forEach((r) => compareMap.set(r.district_id, r));

    let minValue = Infinity;
    let maxValue = -Infinity;

    const features = (geojson.features as any[]).map((feature: any) => {
      const row = yearMap.get(feature.properties.id) || null;
      const waterRatio: number | null = row?.water_ratio ?? null;
      const compareRow = compareYear ? compareMap.get(feature.properties.id) || null : null;
      const compareRatio: number | null = compareRow?.water_ratio ?? null;
      const delta = waterRatio !== null && compareRatio !== null ? +(waterRatio - compareRatio).toFixed(4) : null;
      const areaRai = districtAreaRaiMap.get(feature.properties.id) ?? 0;
      const waterAreaRai = waterRatio !== null ? Math.round(waterRatio * areaRai) : null;

      if (waterRatio !== null) {
        minValue = Math.min(minValue, waterRatio);
        maxValue = Math.max(maxValue, waterRatio);
      }

      return {
        ...feature,
        properties: {
          ...feature.properties,
          water_ratio: waterRatio,
          water_area_rai: waterAreaRai,
          district_area_rai: areaRai,
          delta,
          compare_water_ratio: compareRatio,
        },
      };
    });

    // Summary calculations
    let summaryRows = dbAllRows.filter((r: any) => typeof r.water_ratio === "number");
    if (districtFilter && districtFilter !== ALL_DISTRICTS) {
      summaryRows = summaryRows.filter(
        (r: any) => r.district_name === districtFilter || `เขต${r.district_name}` === districtFilter
      );
    }

    // Yearly trend: average water_ratio per year
    const trendAcc: Record<number, { sum: number; count: number }> = {};
    summaryRows.forEach((r: any) => {
      if (!trendAcc[r.year]) trendAcc[r.year] = { sum: 0, count: 0 };
      trendAcc[r.year].sum += r.water_ratio;
      trendAcc[r.year].count += 1;
    });
    const yearlyTrend = Object.keys(trendAcc).sort().map((y) => [
      y,
      parseFloat((trendAcc[Number(y)].sum / trendAcc[Number(y)].count).toFixed(4)),
    ]);

    // Water area trend: total water area in rai per year (Bangkok-wide)
    const areaTrendAcc: Record<number, number> = {};
    dbAllRows.forEach((r: any) => {
      if (typeof r.water_ratio !== "number") return;
      const areaRai = districtAreaRaiMap.get(r.district_id) ?? 0;
      areaTrendAcc[r.year] = (areaTrendAcc[r.year] || 0) + Math.round(r.water_ratio * areaRai);
    });
    const waterAreaTrend = Object.keys(areaTrendAcc).sort().map((y) => [y, areaTrendAcc[Number(y)]]);

    // Current year summary
    const currentYearRows = dbYearRows.filter((r) => typeof r.water_ratio === "number");
    const avgWaterRatio = currentYearRows.length
      ? parseFloat((currentYearRows.reduce((s, r) => s + (r.water_ratio ?? 0), 0) / currentYearRows.length).toFixed(4))
      : null;
    const totalWaterAreaRai = currentYearRows.reduce((s, r) => {
      const areaRai = districtAreaRaiMap.get(r.district_id) ?? 0;
      return s + Math.round((r.water_ratio ?? 0) * areaRai);
    }, 0);

    // Ranking: sorted by water_ratio descending
    const ranking = [...currentYearRows]
      .sort((a, b) => (b.water_ratio ?? 0) - (a.water_ratio ?? 0))
      .map((r) => {
        const areaRai = districtAreaRaiMap.get(r.district_id) ?? 0;
        return [
          r.district_name ?? districtNameById.get(r.district_id) ?? "ไม่ระบุ",
          r.water_ratio,
          Math.round((r.water_ratio ?? 0) * areaRai),
        ];
      });

    const topWet = ranking.slice(0, 5);
    const topDry = [...ranking].reverse().slice(0, 5);

    // Compare stats
    const compareYearRows = dbCompareRows.filter((r) => typeof r.water_ratio === "number");
    const baselineAvg = compareYearRows.length
      ? parseFloat((compareYearRows.reduce((s, r) => s + (r.water_ratio ?? 0), 0) / compareYearRows.length).toFixed(4))
      : null;
    const avgDelta = avgWaterRatio !== null && baselineAvg !== null
      ? parseFloat((avgWaterRatio - baselineAvg).toFixed(4))
      : null;

    return NextResponse.json({
      geojson: { type: "FeatureCollection", features },
      invertedMask,
      summary: {
        selectedYear: year,
        compareYear,
        avgWaterRatio,
        totalWaterAreaRai,
        baselineAvg,
        avgDelta,
        topWet,
        topDry,
        ranking,
        yearlyTrend,
        waterAreaTrend,
        min_value: minValue !== Infinity ? minValue : 0,
        max_value: maxValue !== -Infinity ? maxValue : 0.5,
        dataSource: useDb ? "supabase district_statistics" : "no data",
      },
    }, {
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200" },
    });
  } catch (err: any) {
    console.error("Flood Risk API Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}