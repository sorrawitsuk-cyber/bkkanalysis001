/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import * as turf from "@turf/turf";
import geojson from "@/data/bkk_districts.json";
import { supabaseServer as supabase } from "@/lib/supabase/server";
import ee, { initGEE } from "@/lib/gee";
import type { DistrictStatistic } from "@/types/district";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALL_DISTRICTS = "ทั้งหมด";

const districtAreaRaiMap = new Map<number, number>(
  (geojson.features as any[]).map((f: any) => [
    f.properties.id,
    Math.round(turf.area(f) / 1600),
  ])
);

// ── GEE helpers ──────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`GEE timeout after ${ms}ms`)), ms)
    ),
  ]);
}

function evaluateEe<T>(eeObject: any): Promise<T> {
  return new Promise((resolve, reject) => {
    eeObject.evaluate((value: T, error: any) => {
      if (error) reject(error);
      else resolve(value);
    });
  });
}

function getDistrictFeatureCollection() {
  return ee.FeatureCollection(
    (geojson.features as any[]).map((feature: any) =>
      ee.Feature(ee.Geometry(feature.geometry).simplify(250), {
        id: feature.properties.id,
        name_th: feature.properties.name_th,
      })
    )
  );
}

function maskSentinel2(image: any) {
  const scl = image.select("SCL");
  const clear = scl.neq(0).and(scl.neq(1)).and(scl.neq(3))
    .and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10)).and(scl.neq(11));
  return image.updateMask(clear);
}

async function computeGeeWaterStats(year: number): Promise<any[]> {
  const today = new Date();
  const startDate = `${year}-01-01`;
  const endDate = year === today.getFullYear()
    ? today.toISOString().split("T")[0]
    : `${year}-12-31`;

  const bkkBbox = ee.Geometry.BBox(100.329, 13.494, 100.935, 13.956);

  const collection = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(bkkBbox)
    .filterDate(startDate, endDate)
    .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 30))
    .map(maskSentinel2)
    .map((image: any) => {
      const green = image.select("B3").divide(10000);
      const nir   = image.select("B8").divide(10000);
      const swir  = image.select("B11").divide(10000);
      const ndwi  = green.subtract(nir).divide(green.add(nir)).rename("ndwi");
      const mndwi = green.subtract(swir).divide(green.add(swir)).rename("mndwi");
      return image.addBands([ndwi, mndwi]);
    });

  const ndwiMean  = collection.select("ndwi").mean().rename("ndwi_mean");
  const mndwiMean = collection.select("mndwi").mean().rename("mndwi_mean");
  const waterMask = ndwiMean.gt(0.05).rename("water_ratio");

  const stacked = ndwiMean.addBands(mndwiMean).addBands(waterMask);
  const districts = getDistrictFeatureCollection();

  const result = await evaluateEe<any>(stacked.reduceRegions({
    collection: districts,
    reducer: ee.Reducer.mean(),
    scale: 100,
    tileScale: 2,
  }));

  return (result?.features ?? []).map((feat: any) => {
    const p = feat.properties ?? {};
    const toNum = (v: any) => (typeof v === "number" && Number.isFinite(v) ? +v.toFixed(4) : null);
    return {
      district_id:  p.id,
      district_name: p.name_th,
      ndwi_mean:    toNum(p.ndwi_mean),
      mndwi_mean:   toNum(p.mndwi_mean),
      water_ratio:  toNum(p.water_ratio),
    };
  });
}

// ── Supabase helpers (kept as secondary source) ───────────────────────────────

async function loadDbRows(year: number): Promise<DistrictStatistic[]> {
  const { data, error } = await supabase
    .from("district_statistics")
    .select("district_id, district_name, year, water_ratio, ndwi_mean, mndwi_mean")
    .eq("year", year);
  if (error || !data || data.length === 0) return [];
  return data as DistrictStatistic[];
}

async function loadAllDbRows(): Promise<DistrictStatistic[]> {
  const { data, error } = await supabase
    .from("district_statistics")
    .select("district_id, district_name, year, water_ratio, ndwi_mean, mndwi_mean")
    .order("year", { ascending: true });
  if (error || !data || data.length === 0) return [];
  return data as DistrictStatistic[];
}

function hasWaterData(rows: DistrictStatistic[]): boolean {
  return rows.some((r) => typeof r.water_ratio === "number");
}

// ── Supabase ID → GeoJSON ID mapping ─────────────────────────────────────────

async function buildIdMap(): Promise<Map<number, number>> {
  const geoJsonIdByName = new Map<string, number>(
    (geojson.features as any[]).map((f: any) => [f.properties.name_th, f.properties.id])
  );
  const map = new Map<number, number>();
  try {
    const { data } = await supabase.from("districts").select("id, name_th");
    (data ?? []).forEach((d: any) => {
      const geoId = geoJsonIdByName.get(d.name_th);
      if (geoId !== undefined) map.set(d.id, geoId);
    });
  } catch { /* fall through */ }
  return map;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get("year") || "2024", 10);
    const districtFilter = searchParams.get("district");
    const compareYearStr = searchParams.get("compareYear");
    const compareYear = compareYearStr ? parseInt(compareYearStr, 10) : null;

    const districtNameById = new Map<number, string>(
      (geojson.features as any[]).map((f: any) => [f.properties.id, f.properties.name_th])
    );

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

    // ── 1. Try GEE for live per-district water stats ──────────────────────────
    let geeYearRows: any[] = [];
    let geeCompareRows: any[] = [];
    let dataSource = "no data";

    try {
      await initGEE();
      const [yearStats, compareStats] = await Promise.all([
        withTimeout(computeGeeWaterStats(year), 45000),
        compareYear ? withTimeout(computeGeeWaterStats(compareYear), 45000) : Promise.resolve([]),
      ]);
      geeYearRows   = yearStats;
      geeCompareRows = compareStats;
      if (geeYearRows.some((r) => r.water_ratio !== null)) dataSource = "GEE (live Sentinel-2)";
    } catch (geeErr) {
      console.warn("GEE water stats failed, trying Supabase:", geeErr);
    }

    // ── 2. Supabase fallback if GEE gave no data ──────────────────────────────
    let yearRows:    any[] = geeYearRows;
    let compareRows: any[] = geeCompareRows;
    let allRows:     any[] = [];

    if (!hasWaterData(yearRows as DistrictStatistic[])) {
      const idMap = await buildIdMap();
      const normalise = (rows: any[]) =>
        rows.map((row) => {
          const geoId = idMap.get(row.district_id);
          return geoId !== undefined
            ? { ...row, district_id: geoId, district_name: districtNameById.get(geoId) ?? row.district_name }
            : row;
        });

      yearRows    = normalise(await loadDbRows(year));
      compareRows = compareYear ? normalise(await loadDbRows(compareYear)) : [];
      allRows     = normalise(await loadAllDbRows());
      if (hasWaterData(yearRows as DistrictStatistic[])) dataSource = "supabase district_statistics";
    }

    // ── 3. Build features ─────────────────────────────────────────────────────
    const yearMap    = new Map<number, any>(yearRows.map((r) => [r.district_id, r]));
    const compareMap = new Map<number, any>(compareRows.map((r) => [r.district_id, r]));

    let minValue = Infinity;
    let maxValue = -Infinity;

    const features = (geojson.features as any[]).map((feature: any) => {
      const row         = yearMap.get(feature.properties.id) || null;
      const waterRatio: number | null  = row?.water_ratio ?? null;
      const ndwiMean:   number | null  = row?.ndwi_mean   ?? null;
      const mndwiMean:  number | null  = row?.mndwi_mean  ?? null;
      const compareRow  = compareYear ? compareMap.get(feature.properties.id) || null : null;
      const compareRatio: number | null = compareRow?.water_ratio ?? null;
      const delta  = waterRatio !== null && compareRatio !== null ? +(waterRatio - compareRatio).toFixed(4) : null;
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
          water_ratio:          waterRatio,
          water_area_rai:       waterAreaRai,
          district_area_rai:    areaRai,
          delta,
          compare_water_ratio:  compareRatio,
          ndwi_mean:            ndwiMean,
          mndwi_mean:           mndwiMean,
          display_value:        ndwiMean ?? waterRatio,
          display_label:        "NDWI",
        },
      };
    });

    // ── 4. Summary stats ──────────────────────────────────────────────────────
    let summaryRows = allRows.length > 0
      ? allRows.filter((r: any) => typeof r.water_ratio === "number")
      : yearRows.filter((r: any) => r.water_ratio !== null);

    if (districtFilter && districtFilter !== ALL_DISTRICTS) {
      summaryRows = summaryRows.filter(
        (r: any) => r.district_name === districtFilter || `เขต${r.district_name}` === districtFilter
      );
    }

    // Yearly trend (from Supabase historical data; GEE provides current year only)
    const trendAcc: Record<number, { sum: number; count: number }> = {};
    summaryRows.forEach((r: any) => {
      if (!trendAcc[r.year]) trendAcc[r.year] = { sum: 0, count: 0 };
      trendAcc[r.year].sum   += r.water_ratio;
      trendAcc[r.year].count += 1;
    });
    // Include current GEE year in trend if it's not already present
    if (geeYearRows.length > 0 && !trendAcc[year]) {
      const geeWaterRows = geeYearRows.filter((r: any) => r.water_ratio !== null);
      if (geeWaterRows.length > 0) {
        trendAcc[year] = {
          sum: geeWaterRows.reduce((s: number, r: any) => s + r.water_ratio, 0),
          count: geeWaterRows.length,
        };
      }
    }
    const yearlyTrend = Object.keys(trendAcc).sort().map((y) => [
      y,
      parseFloat((trendAcc[Number(y)].sum / trendAcc[Number(y)].count).toFixed(4)),
    ]);

    const areaTrendAcc: Record<number, number> = {};
    [...summaryRows, ...(geeYearRows.length > 0 && !allRows.length ? geeYearRows.map((r: any) => ({ ...r, year })) : [])].forEach((r: any) => {
      if (typeof r.water_ratio !== "number") return;
      const areaRai = districtAreaRaiMap.get(r.district_id) ?? 0;
      areaTrendAcc[r.year] = (areaTrendAcc[r.year] || 0) + Math.round(r.water_ratio * areaRai);
    });
    const waterAreaTrend = Object.keys(areaTrendAcc).sort().map((y) => [y, areaTrendAcc[Number(y)]]);

    const currentYearRows = yearRows.filter((r) => r.water_ratio !== null);
    const avgWaterRatio = currentYearRows.length
      ? parseFloat((currentYearRows.reduce((s, r) => s + (r.water_ratio ?? 0), 0) / currentYearRows.length).toFixed(4))
      : null;
    const avgNdwiMean = yearRows.some((r: any) => r.ndwi_mean !== null)
      ? parseFloat((yearRows.filter((r: any) => r.ndwi_mean !== null).reduce((s: number, r: any) => s + r.ndwi_mean, 0) / yearRows.filter((r: any) => r.ndwi_mean !== null).length).toFixed(4))
      : null;
    const totalWaterAreaRai = currentYearRows.reduce((s, r) => {
      const areaRai = districtAreaRaiMap.get(r.district_id) ?? 0;
      return s + Math.round((r.water_ratio ?? 0) * areaRai);
    }, 0);

    const ranking = [...currentYearRows]
      .sort((a, b) => (b.water_ratio ?? 0) - (a.water_ratio ?? 0))
      .map((r) => {
        const areaRai = districtAreaRaiMap.get(r.district_id) ?? 0;
        return [
          r.district_name ?? districtNameById.get(r.district_id) ?? "ไม่ระบุ",
          r.ndwi_mean ?? r.water_ratio,
          Math.round((r.water_ratio ?? 0) * areaRai),
        ];
      });

    const topWet = ranking.slice(0, 5);
    const topDry = [...ranking].reverse().slice(0, 5);

    const compareYearRows = compareRows.filter((r) => r.water_ratio !== null);
    const baselineAvg = compareYearRows.length
      ? parseFloat((compareYearRows.reduce((s, r) => s + (r.water_ratio ?? 0), 0) / compareYearRows.length).toFixed(4))
      : null;
    const avgDelta = avgWaterRatio !== null && baselineAvg !== null
      ? parseFloat((avgWaterRatio - baselineAvg).toFixed(4))
      : null;

    return NextResponse.json(
      {
        geojson: { type: "FeatureCollection", features },
        invertedMask,
        summary: {
          selectedYear: year,
          compareYear,
          avgWaterRatio,
          avgDisplayValue: avgNdwiMean ?? avgWaterRatio,
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
          displayLabel: "NDWI",
          dataSource,
        },
      },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" } }
    );
  } catch (err: any) {
    console.error("Flood Risk API Error:", err);
    // Return valid empty GeoJSON so the page never shows a broken state
    const emptyFeatures = (geojson.features as any[]).map((feature: any) => ({
      ...feature,
      properties: {
        ...feature.properties,
        water_ratio: null, water_area_rai: null,
        district_area_rai: districtAreaRaiMap.get(feature.properties.id) ?? null,
        delta: null, compare_water_ratio: null,
        ndwi_mean: null, mndwi_mean: null,
        display_value: null, display_label: "NDWI",
      },
    }));
    return NextResponse.json({
      geojson: { type: "FeatureCollection", features: emptyFeatures },
      invertedMask: null,
      summary: {
        selectedYear: 0, compareYear: null,
        avgWaterRatio: null, avgDisplayValue: null,
        totalWaterAreaRai: 0, baselineAvg: null, avgDelta: null,
        topWet: [], topDry: [], ranking: [],
        yearlyTrend: [], waterAreaTrend: [],
        min_value: 0, max_value: 0.5,
        displayLabel: "NDWI",
        dataSource: `error: ${err.message}`,
      },
    });
  }
}
