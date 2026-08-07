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
    : `${year + 1}-01-01`;

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

  // Exclude permanent water (JRC occurrence >= 70%) — removes Chao Phraya and major canals
  const jrcPermanent = ee.Image("JRC/GSW1_4/GlobalSurfaceWater")
    .select("occurrence").gte(70).unmask(0);
  const seasonalWaterMask = ndwiMean.gt(0.05).and(jrcPermanent.not()).rename("seasonal_water_ratio");

  const stacked = ndwiMean.addBands(mndwiMean).addBands(waterMask).addBands(seasonalWaterMask);
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
      district_id:           p.id,
      district_name:         p.name_th,
      year,
      ndwi_mean:             toNum(p.ndwi_mean),
      mndwi_mean:            toNum(p.mndwi_mean),
      water_ratio:           toNum(p.water_ratio),
      seasonal_water_ratio:  toNum(p.seasonal_water_ratio),
    };
  });
}

// ── Supabase helpers (kept as secondary source) ───────────────────────────────

async function loadDbRows(year: number): Promise<DistrictStatistic[]> {
  const { data, error } = await supabase
    .from("district_statistics")
    .select("district_id, year, water_ratio, ndwi_mean, mndwi_mean")
    .eq("year", year);
  if (error) {
    console.warn("Flood Supabase year query failed:", error.message);
    return [];
  }
  if (!data || data.length === 0) return [];
  return data as DistrictStatistic[];
}

async function loadAllDbRows(): Promise<DistrictStatistic[]> {
  const { data, error } = await supabase
    .from("district_statistics")
    .select("district_id, year, water_ratio, ndwi_mean, mndwi_mean")
    .order("year", { ascending: true });
  if (error) {
    console.warn("Flood Supabase trend query failed:", error.message);
    return [];
  }
  if (!data || data.length === 0) return [];
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
    const requestedLayer = searchParams.get("layer") === "mndwi_mean" ? "mndwi_mean" : "ndwi_mean";
    const displayLabel = requestedLayer === "mndwi_mean" ? "MNDWI (mean)" : "NDWI (mean)";

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
      const seasonalWaterRatio: number | null = row?.seasonal_water_ratio ?? null;
      const effectiveWaterRatio = seasonalWaterRatio ?? waterRatio;
      const compareRatio: number | null =
        compareRow?.seasonal_water_ratio ?? compareRow?.water_ratio ?? null;
      const displayValue: number | null = row?.[requestedLayer] ?? null;
      const compareDisplayValue: number | null = compareRow?.[requestedLayer] ?? null;
      const delta = displayValue !== null && compareDisplayValue !== null
        ? +(displayValue - compareDisplayValue).toFixed(4)
        : null;
      const areaRai = districtAreaRaiMap.get(feature.properties.id) ?? 0;
      const waterAreaRai = effectiveWaterRatio !== null
        ? Math.round(effectiveWaterRatio * areaRai)
        : null;

      if (displayValue !== null) {
        minValue = Math.min(minValue, displayValue);
        maxValue = Math.max(maxValue, displayValue);
      }

      return {
        ...feature,
        properties: {
          ...feature.properties,
          water_ratio:           waterRatio,
          seasonal_water_ratio:  seasonalWaterRatio,
          water_area_rai:        waterAreaRai,
          district_area_rai:     areaRai,
          delta,
          compare_water_ratio:   compareRatio,
          ndwi_mean:             ndwiMean,
          mndwi_mean:            mndwiMean,
          display_value:         displayValue,
          display_label:         displayLabel,
          river_corrected:       seasonalWaterRatio !== null,
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
    const trendAcc: Record<number, { weightedSum: number; area: number }> = {};
    summaryRows.forEach((r: any) => {
      if (typeof r?.[requestedLayer] !== "number") return;
      if (!Number.isInteger(r.year)) return;
      const area = districtAreaRaiMap.get(r.district_id) ?? 0;
      if (area <= 0) return;
      if (!trendAcc[r.year]) trendAcc[r.year] = { weightedSum: 0, area: 0 };
      trendAcc[r.year].weightedSum += r[requestedLayer] * area;
      trendAcc[r.year].area += area;
    });
    // Include current GEE year in trend if it's not already present
    if (geeYearRows.length > 0 && !trendAcc[year]) {
      const geeDisplayRows = geeYearRows.filter((r: any) => typeof r?.[requestedLayer] === "number");
      if (geeDisplayRows.length > 0) {
        trendAcc[year] = {
          weightedSum: geeDisplayRows.reduce((sum: number, row: any) => {
            const area = districtAreaRaiMap.get(row.district_id) ?? 0;
            return sum + row[requestedLayer] * area;
          }, 0),
          area: geeDisplayRows.reduce(
            (sum: number, row: any) => sum + (districtAreaRaiMap.get(row.district_id) ?? 0),
            0,
          ),
        };
      }
    }
    const yearlyTrend = Object.keys(trendAcc)
      .map(Number)
      .filter((trendYear) => Number.isInteger(trendYear) && trendAcc[trendYear]?.area > 0)
      .sort((a, b) => a - b)
      .map((trendYear) => [
        String(trendYear),
        parseFloat((trendAcc[trendYear].weightedSum / trendAcc[trendYear].area).toFixed(4)),
      ]);

    const areaTrendAcc: Record<number, number> = {};
    summaryRows.forEach((r: any) => {
      if (typeof r.water_ratio !== "number") return;
      if (!Number.isInteger(r.year)) return;
      const areaRai = districtAreaRaiMap.get(r.district_id) ?? 0;
      areaTrendAcc[r.year] = (areaTrendAcc[r.year] || 0) + Math.round(r.water_ratio * areaRai);
    });
    const waterAreaTrend = Object.keys(areaTrendAcc).sort().map((y) => [y, areaTrendAcc[Number(y)]]);

    const currentYearRows = yearRows.filter((r) =>
      r.seasonal_water_ratio !== null || r.water_ratio !== null
    );
    const effectiveRatio = (row: any): number | null =>
      row?.seasonal_water_ratio ?? row?.water_ratio ?? null;
    const riverCorrected = currentYearRows.length > 0 &&
      currentYearRows.every((row) => typeof row.seasonal_water_ratio === "number");
    const totalDistrictArea = currentYearRows.reduce(
      (sum, row) => sum + (districtAreaRaiMap.get(row.district_id) ?? 0),
      0,
    );
    const avgWaterRatio = totalDistrictArea > 0
      ? parseFloat((currentYearRows.reduce((sum, row) => {
          const area = districtAreaRaiMap.get(row.district_id) ?? 0;
          return sum + (effectiveRatio(row) ?? 0) * area;
        }, 0) / totalDistrictArea).toFixed(4))
      : null;
    const displayRows = yearRows.filter((row: any) => typeof row?.[requestedLayer] === "number");
    const displayArea = displayRows.reduce(
      (sum: number, row: any) => sum + (districtAreaRaiMap.get(row.district_id) ?? 0),
      0,
    );
    const avgDisplayValue = displayArea > 0
      ? parseFloat((displayRows.reduce((sum: number, row: any) => {
          const area = districtAreaRaiMap.get(row.district_id) ?? 0;
          return sum + row[requestedLayer] * area;
        }, 0) / displayArea).toFixed(4))
      : null;
    const totalWaterAreaRai = currentYearRows.length
      ? currentYearRows.reduce((s, r) => {
          const areaRai = districtAreaRaiMap.get(r.district_id) ?? 0;
          return s + Math.round((effectiveRatio(r) ?? 0) * areaRai);
        }, 0)
      : null;

    const ranking = [...currentYearRows]
      .filter((row) => typeof row?.[requestedLayer] === "number")
      .sort((a, b) => (b[requestedLayer] ?? -Infinity) - (a[requestedLayer] ?? -Infinity))
      .map((r) => {
        const areaRai = districtAreaRaiMap.get(r.district_id) ?? 0;
        return [
          r.district_name ?? districtNameById.get(r.district_id) ?? "ไม่ระบุ",
          r[requestedLayer],
          Math.round((effectiveRatio(r) ?? 0) * areaRai),
        ];
      });

    const topWet = ranking.slice(0, 5);
    const topDry = [...ranking].reverse().slice(0, 5);

    const compareYearRows = compareRows.filter((row) => typeof row?.[requestedLayer] === "number");
    const compareArea = compareYearRows.reduce(
      (sum, row) => sum + (districtAreaRaiMap.get(row.district_id) ?? 0),
      0,
    );
    const baselineAvg = compareArea > 0
      ? parseFloat((compareYearRows.reduce((sum, row) => {
          const area = districtAreaRaiMap.get(row.district_id) ?? 0;
          return sum + row[requestedLayer] * area;
        }, 0) / compareArea).toFixed(4))
      : null;
    const avgDelta = avgDisplayValue !== null && baselineAvg !== null
      ? parseFloat((avgDisplayValue - baselineAvg).toFixed(4))
      : null;

    return NextResponse.json(
      {
        geojson: { type: "FeatureCollection", features },
        invertedMask,
        summary: {
          selectedYear: year,
          compareYear,
          avgWaterRatio,
          avgDisplayValue,
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
          displayLabel,
          riverCorrected,
          dataSource,
          dataQuality: dataSource === "no data"
            ? "unavailable"
            : dataSource.startsWith("GEE")
              ? "observed"
              : "unknown",
          sourceLabel: dataSource === "no data" ? null : dataSource,
          sourceNote: dataSource === "no data"
            ? "ไม่พบข้อมูลดาวเทียมสำหรับปีที่เลือก"
            : dataSource.startsWith("GEE")
              ? "Sentinel-2 composite ค่าเฉลี่ย, สถิติรายเขตคำนวณที่ scale 100 เมตร; NDWI > 0.05 ใช้คัดกรองสัญญาณน้ำหรือความชื้น ไม่ใช่ขอบเขตน้ำท่วม"
              : "ค่าจากฐานเดิมไม่มี provenance รายแถว จึงใช้สำรวจแนวโน้มเท่านั้น",
        },
      },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" } }
    );
  } catch (err: any) {
    console.error("Flood Risk API Error:", err);
    return NextResponse.json(
      {
        error: "ข้อมูลสัญญาณน้ำจาก Google Earth Engine ไม่พร้อมใช้งานในขณะนี้",
        status: "unavailable",
        source: "Sentinel-2 SR Harmonized",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
