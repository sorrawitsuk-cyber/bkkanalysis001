/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import * as turf from "@turf/turf";
import geojson from "@/data/bkk_districts.json";
import lstData from "@/data/lst_data.json";
import { supabaseServer as supabase } from "@/lib/supabase/server";
import ee, { initGEE } from "@/lib/gee";
import {
  calculatePriorityScore,
  getNdviClass,
  getPriorityReasons,
  normalizeNdviScore,
  resolveNdviMean,
} from "@/lib/ndvi";
import { getBangkokNdviSummaryFromRows } from "@/lib/district-statistics";
import type { DistrictStatistic } from "@/types/district";

// Remove force-dynamic so Next.js can use route-level caching; rely on Cache-Control headers for CDN.
export const maxDuration = 60;

// --- Module-level caches (never change between requests) ---

const districtAreaRaiMap = new Map<number, number>(
  (geojson.features as any[]).map((f: any) => [
    f.properties.id,
    Math.round(turf.area(f) / 1600),
  ])
);

const districtNameById = new Map<number, string>(
  (geojson.features as any[]).map((f: any) => [f.properties.id, f.properties.name_th as string])
);

const geoJsonIdByName = new Map<string, number>(
  (geojson.features as any[]).map((f: any) => [f.properties.name_th as string, f.properties.id as number])
);

// Computed once on first request; turf.union over 50 polygons is expensive.
let _invertedMask: any = null;
function getInvertedMask(): any {
  if (_invertedMask) return _invertedMask;
  try {
    let bkkPolygon: any = geojson.features[0];
    for (let i = 1; i < geojson.features.length; i++) {
      bkkPolygon = turf.union(turf.featureCollection([bkkPolygon, geojson.features[i]]));
    }
    _invertedMask = turf.mask(bkkPolygon);
  } catch (err) {
    console.error("Mask generation failed:", err);
    _invertedMask = null;
  }
  return _invertedMask;
}

// Supabase district ID→GeoJSON ID mapping: cached on success; retried each request on failure.
let _geoJsonIdBySupabaseId: Map<number, number> | null = null;
async function getGeoJsonIdBySupabaseId(): Promise<Map<number, number>> {
  if (_geoJsonIdBySupabaseId) return _geoJsonIdBySupabaseId;
  try {
    const { data } = await supabase.from("districts").select("id, name_th");
    const map = new Map<number, number>();
    if (data && data.length > 0) {
      data.forEach((d: any) => {
        const geoId = geoJsonIdByName.get(d.name_th);
        if (geoId !== undefined) map.set(d.id, geoId);
      });
      _geoJsonIdBySupabaseId = map; // only cache on success
    }
  } catch {
    // do not cache — next request will retry
  }
  return _geoJsonIdBySupabaseId ?? new Map();
}

type DistrictMetric = "lst" | "vegetation" | "builtup" | "air_pollution";

function valueFor(row: any, metric: DistrictMetric): number | null {
  if (!row) return null;
  if (metric === "vegetation") return resolveNdviMean(row);
  if (metric === "builtup") return typeof row.ndbi_mean === "number" ? row.ndbi_mean : null;
  if (metric === "air_pollution") return typeof row.no2_mean === "number" ? row.no2_mean : null;
  return typeof row.mean_lst === "number" ? row.mean_lst : null;
}

function toVegetationFallbackRow(row: any): DistrictStatistic {
  const ndviMean = typeof row.vegetation_index === "number" ? row.vegetation_index : null;
  // Urban green threshold 0.20 (Zhu et al. 2023): fraction of pixels with NDVI ≥ 0.20
  const greenAreaRatio = ndviMean === null ? null : Math.max(0.03, Math.min(0.65, ndviMean - 0.08));
  const districtAreaRai = districtAreaRaiMap.get(row.district_id) ?? 19600; // ~BKK avg if unknown
  return {
    district_id: row.district_id,
    district_name: row.district_name,
    year: row.year,
    ndvi_mean: ndviMean,
    ndvi_median: ndviMean,
    ndvi_min: ndviMean === null ? null : Math.max(-0.1, ndviMean - 0.18),
    ndvi_max: ndviMean === null ? null : Math.min(0.85, ndviMean + 0.22),
    ndvi_score: normalizeNdviScore(ndviMean),
    ndvi_class: getNdviClass(ndviMean),
    green_area_ratio: greenAreaRatio,
    green_area_rai: greenAreaRatio === null ? null : Math.round(greenAreaRatio * districtAreaRai),
    low_green_ratio: greenAreaRatio === null ? null : Math.max(0.05, 0.62 - greenAreaRatio),
    water_ratio: 0,
    ntl_mean: null,
    processing_note: "Local fallback from demo vegetation_index; green area is approximate.",
  };
}

// Compute derived green-space fields from ndvi_mean when Supabase rows lack them.
function enrichVegetationRow(row: any): any {
  const ndviMean = typeof row.ndvi_mean === "number" ? row.ndvi_mean : null;
  if (ndviMean === null) return row;
  const districtAreaRai = districtAreaRaiMap.get(row.district_id) ?? 19600;
  const greenAreaRatio = row.green_area_ratio ?? Math.max(0.03, Math.min(0.65, ndviMean - 0.08));
  return {
    ...row,
    ndvi_median: row.ndvi_median ?? ndviMean,
    ndvi_min: row.ndvi_min ?? Math.max(-0.1, ndviMean - 0.18),
    ndvi_max: row.ndvi_max ?? Math.min(0.85, ndviMean + 0.22),
    ndvi_score: row.ndvi_score ?? normalizeNdviScore(ndviMean),
    ndvi_class: row.ndvi_class || getNdviClass(ndviMean),
    green_area_ratio: greenAreaRatio,
    green_area_rai: row.green_area_rai ?? Math.round(greenAreaRatio * districtAreaRai),
    low_green_ratio: row.low_green_ratio ?? Math.max(0.05, 0.62 - greenAreaRatio),
  };
}

// Normalize a Supabase row: remap district_id to GeoJSON feature ID using
// the embedded districts join (name_th), falling back to the pre-built ID map.
function remapRow(row: any): DistrictStatistic {
  // Primary: name from FK join (works regardless of auto-increment ID ordering)
  const joinedName: string | undefined = row.districts?.name_th;
  const geoIdByName = joinedName ? geoJsonIdByName.get(joinedName) : undefined;
  // Secondary: pre-built Supabase→GeoJSON ID map (built when districts table is readable)
  const geoIdByMap = _geoJsonIdBySupabaseId?.get(row.district_id);
  const geoId = geoIdByName ?? geoIdByMap ?? row.district_id;
  const name = joinedName ?? districtNameById.get(geoId) ?? row.district_name ?? null;
  return {
    ...row,
    districts: undefined,
    district_id: geoId,
    district_name: name,
    // VIIRS annual product currently ends at 2024. Do not relabel the
    // duplicated 2024 seed as observations for later years.
    ntl_mean: row.year > 2024 ? null : row.ntl_mean,
    ntl_max: row.year > 2024 ? null : row.ntl_max,
  } as DistrictStatistic;
}

// Columns selected for the choropleth map view (all 50 districts, one year)
const MAP_COLUMNS = [
  "district_id", "year",
  "mean_lst", "max_lst",
  "ndvi_mean", "ndvi_median", "ndvi_min", "ndvi_max", "ndvi_score", "ndvi_class", "green_area_ratio", "green_area_rai", "low_green_ratio", "water_ratio", "ntl_mean",
  "ndvi_data_source", "ndbi_mean", "ndbi_max", "ndbi_data_source",
  "no2_mean", "no2_max", "co_mean", "co_max", "so2_mean", "so2_max",
  "aerosol_index_mean", "aerosol_index_max", "pollution_score", "pollution_class",
  "air_quality_source", "air_quality_note",
].join(", ");

// Columns for trend summary (subset — no heavy geometry/class fields)
const TREND_COLUMNS = [
  "district_id", "year",
  "mean_lst", "max_lst",
  "ndvi_mean", "ndvi_median", "ndvi_min", "ndvi_max", "ndvi_score", "green_area_ratio", "green_area_rai", "low_green_ratio", "water_ratio", "ntl_mean",
  "ndvi_data_source", "ndbi_mean", "ndbi_data_source",
  "no2_mean", "pollution_score",
].join(", ");

async function loadDbRows(year: number): Promise<DistrictStatistic[]> {
  const { data, error } = await supabase
    .from("district_statistics")
    .select(MAP_COLUMNS)
    .eq("year", year);
  if (error || !data || data.length === 0) {
    if (error) console.warn("district_statistics fetch failed:", error.message);
    return [];
  }
  return (data as any[]).map(remapRow);
}

async function loadAllDbRows(): Promise<DistrictStatistic[]> {
  const { data, error } = await supabase
    .from("district_statistics")
    .select(TREND_COLUMNS)
    .order("year", { ascending: true });
  if (error || !data || data.length === 0) return [];
  return (data as any[]).map(remapRow);
}

function hasLstData(rows: DistrictStatistic[]): boolean {
  return rows.some((r) => typeof r.mean_lst === "number");
}

function hasNdviData(rows: DistrictStatistic[]): boolean {
  return rows.some((r) => typeof r.ndvi_mean === "number");
}

function hasNdbiData(rows: any[]): boolean {
  return rows.some((r) => typeof r.ndbi_mean === "number");
}

function hasAirPollutionData(rows: any[]): boolean {
  return rows.some((r) => typeof r.no2_mean === "number" || typeof r.pollution_score === "number");
}

function firstSource(rows: any[], field: string): string | null {
  return rows.find((row) => typeof row?.[field] === "string" && row[field].trim())?.[field] ?? null;
}

function metricProvenance(metric: DistrictMetric, rows: any[], useDatabase: boolean, airDataSource: string) {
  if (!useDatabase) {
    return {
      dataSource: metric === "builtup" || metric === "air_pollution"
        ? "no district_statistics rows"
        : "local fallback (mock)",
      dataQuality: "unavailable",
      sourceLabel: null,
      sourceNote: "ไม่พบข้อมูลสำหรับปีและตัวชี้วัดที่เลือก",
    };
  }

  if (metric === "vegetation") {
    const source = firstSource(rows, "ndvi_data_source");
    const modeled = /modeled|modelled|awaiting gee|แบบจำลอง/i.test(source || "");
    return {
      dataSource: source || "unknown NDVI source",
      dataQuality: modeled ? "modeled" : "observed",
      sourceLabel: source || "ไม่ระบุแหล่ง NDVI",
      sourceNote: modeled
        ? "ใช้ดูแนวโน้มเชิงสำรวจเท่านั้น ยังไม่ควรใช้เป็นหลักฐานเชิงนโยบาย"
        : "คำนวณจากภาพดาวเทียมรายเขต",
    };
  }

  if (metric === "builtup") {
    const source = firstSource(rows, "ndbi_data_source");
    const estimated = /seeded|estimate|ประมาณ/i.test(source || "");
    return {
      dataSource: source || "unknown NDBI source",
      dataQuality: estimated ? "estimated" : "observed",
      sourceLabel: source || "ไม่ระบุแหล่ง NDBI",
      sourceNote: estimated
        ? "ค่าถูกสร้างเพื่อสาธิตแนวโน้ม ไม่ใช่ผลประมวลผลดาวเทียมโดยตรง"
        : "คำนวณจากภาพดาวเทียมรายเขต",
    };
  }

  if (metric === "air_pollution") {
    return {
      dataSource: airDataSource,
      dataQuality: "observed",
      sourceLabel: firstSource(rows, "air_quality_source") || airDataSource,
      sourceNote: "ข้อมูลคอลัมน์บรรยากาศจากดาวเทียม เหมาะดูภาพรวม ไม่ใช่ AQI ระดับถนน",
    };
  }

  return {
    dataSource: "district_statistics (Landsat LST)",
    dataQuality: "unknown",
    sourceLabel: "Landsat 8/9 Surface Temperature",
    sourceNote: "ฐานเดิมไม่มี provenance รายแถว; ค่าเป็นอุณหภูมิพื้นผิว ไม่ใช่อุณหภูมิอากาศ",
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`GEE timeout after ${ms}ms`)), ms)),
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

function airPollutionScore(row: any): number | null {
  const parts: [number, number][] = [];
  if (typeof row.no2_mean === "number") parts.push([Math.min(Math.max(row.no2_mean / 0.00030, 0), 1), 0.50]);
  if (typeof row.co_mean === "number") parts.push([Math.min(Math.max((row.co_mean - 0.015) / 0.04, 0), 1), 0.20]);
  if (typeof row.so2_mean === "number") parts.push([Math.min(Math.max(row.so2_mean / 0.00060, 0), 1), 0.15]);
  if (typeof row.aerosol_index_mean === "number") parts.push([Math.min(Math.max((row.aerosol_index_mean + 1) / 3, 0), 1), 0.15]);
  if (parts.length === 0) return null;
  const weighted = parts.reduce((sum, [value, weight]) => sum + value * weight, 0);
  const totalWeight = parts.reduce((sum, [, weight]) => sum + weight, 0);
  return parseFloat(((weighted / totalWeight) * 10).toFixed(2));
}

function airPollutionClass(score: number | null): string | null {
  if (score === null) return null;
  if (score >= 8) return "very_high";
  if (score >= 6) return "high";
  if (score >= 4) return "moderate";
  if (score >= 2) return "low";
  return "very_low";
}

function cleanGeeNumber(value: any, digits: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return parseFloat(value.toFixed(digits));
}

async function computeGeeAirPollutionRows(year: number): Promise<DistrictStatistic[]> {
  const today = new Date();
  const currentYear = today.getFullYear();
  const startDate = `${year}-01-01`;
  const endDate = year >= currentYear ? today.toISOString().split("T")[0] : `${year}-12-31`;
  const bkkBbox = ee.Geometry.BBox(100.329, 13.494, 100.935, 13.956);

  const no2 = ee.ImageCollection("COPERNICUS/S5P/OFFL/L3_NO2")
    .filterBounds(bkkBbox)
    .filterDate(startDate, endDate)
    .select("tropospheric_NO2_column_number_density")
    .mean()
    .rename("no2");
  const co = ee.ImageCollection("COPERNICUS/S5P/OFFL/L3_CO")
    .filterBounds(bkkBbox)
    .filterDate(startDate, endDate)
    .select("CO_column_number_density")
    .mean()
    .rename("co");
  const so2 = ee.ImageCollection("COPERNICUS/S5P/OFFL/L3_SO2")
    .filterBounds(bkkBbox)
    .filterDate(startDate, endDate)
    .select("SO2_column_number_density")
    .mean()
    .rename("so2");
  const aerosol = ee.ImageCollection("COPERNICUS/S5P/OFFL/L3_AER_AI")
    .filterBounds(bkkBbox)
    .filterDate(startDate, endDate)
    .select("absorbing_aerosol_index")
    .mean()
    .rename("aerosol");

  const stacked = no2.addBands(co).addBands(so2).addBands(aerosol);
  const result = await evaluateEe<any>(stacked.reduceRegions({
    collection: getDistrictFeatureCollection(),
    reducer: ee.Reducer.mean().combine(ee.Reducer.max(), "", true),
    scale: 1000,
    tileScale: 2,
  }));

  return (result?.features ?? []).map((feature: any) => {
    const p = feature.properties ?? {};
    const row: any = {
      district_id: p.id,
      district_name: p.name_th,
      year,
      no2_mean: cleanGeeNumber(p.no2_mean, 8),
      no2_max: cleanGeeNumber(p.no2_max, 8),
      co_mean: cleanGeeNumber(p.co_mean, 6),
      co_max: cleanGeeNumber(p.co_max, 6),
      so2_mean: cleanGeeNumber(p.so2_mean, 8),
      so2_max: cleanGeeNumber(p.so2_max, 8),
      aerosol_index_mean: cleanGeeNumber(p.aerosol_mean, 4),
      aerosol_index_max: cleanGeeNumber(p.aerosol_max, 4),
      air_quality_source: "GEE live Sentinel-5P OFFL yearly mean",
      air_quality_note: "Satellite column-density proxy, not ground-station AQI.",
    };
    row.pollution_score = airPollutionScore(row);
    row.pollution_class = airPollutionClass(row.pollution_score);
    return row as DistrictStatistic;
  });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get("year") || "2024", 10);
    const metricParam = searchParams.get("metric");
    const metric = metricParam === "vegetation"
      ? "vegetation"
      : metricParam === "builtup"
        ? "builtup"
        : metricParam === "air_pollution"
          ? "air_pollution"
          : "lst";
    const compareYearStr = searchParams.get("compareYear");
    const compareYear = compareYearStr ? parseInt(compareYearStr, 10) : null;

    const invertedMask = getInvertedMask();
    await getGeoJsonIdBySupabaseId();

    const [dbYearRows, dbCompareRows] = await Promise.all([
      loadDbRows(year),
      compareYear ? loadDbRows(compareYear) : Promise.resolve([]),
    ]);

    // Keep this endpoint citywide even when a district is selected in the UI.
    // District-specific trends come from /api/district-profile; this response
    // powers the 50-district map, rankings, exports, and stats charts.
    const dbAllRows =
      dbYearRows.length > 0
        ? await loadAllDbRows()
        : [];

    const localYearRows = lstData.filter((row: any) => row.year === year);
    const localCompareRows = compareYear ? lstData.filter((row: any) => row.year === compareYear) : [];

    let effectiveYearRows = dbYearRows;
    let effectiveCompareRows = dbCompareRows;
    let effectiveAllRows = dbAllRows;
    let airDataSource = "supabase district_statistics";

    let useDbYear = metric === "vegetation" ? hasNdviData(effectiveYearRows) : metric === "builtup" ? hasNdbiData(effectiveYearRows) : metric === "air_pollution" ? hasAirPollutionData(effectiveYearRows) : hasLstData(effectiveYearRows);
    let useDbCompare = metric === "vegetation" ? hasNdviData(effectiveCompareRows) : metric === "builtup" ? hasNdbiData(effectiveCompareRows) : metric === "air_pollution" ? hasAirPollutionData(effectiveCompareRows) : hasLstData(effectiveCompareRows);
    let useDbAll = metric === "vegetation" ? hasNdviData(effectiveAllRows) : metric === "builtup" ? hasNdbiData(effectiveAllRows) : metric === "air_pollution" ? hasAirPollutionData(effectiveAllRows) : effectiveAllRows.some((r) => typeof r.mean_lst === "number");

    if (metric === "air_pollution" && !useDbYear) {
      try {
        await initGEE();
        const [geeYearResult, geeCompareResult] = await Promise.allSettled([
          withTimeout(computeGeeAirPollutionRows(year), 50000),
          compareYear && !useDbCompare
            ? withTimeout(computeGeeAirPollutionRows(compareYear), 50000)
            : Promise.resolve([]),
        ]);
        const geeYearRows = geeYearResult.status === "fulfilled" ? geeYearResult.value : [];
        const geeCompareRows = geeCompareResult.status === "fulfilled" ? geeCompareResult.value : [];

        if (hasAirPollutionData(geeYearRows)) {
          effectiveYearRows = geeYearRows;
          useDbYear = true;
          airDataSource = "GEE live Sentinel-5P";
        }
        if (compareYear && !useDbCompare && hasAirPollutionData(geeCompareRows)) {
          effectiveCompareRows = geeCompareRows;
          useDbCompare = true;
        }
        if (!useDbAll && hasAirPollutionData(geeYearRows)) {
          effectiveAllRows = [...geeYearRows, ...geeCompareRows];
          useDbAll = true;
        }
      } catch (geeErr) {
        console.warn("GEE air-pollution district stats failed:", geeErr);
      }
    }

    const yearData: any[] = metric === "vegetation"
      ? (useDbYear ? effectiveYearRows.map(enrichVegetationRow) : localYearRows.map((r: any) => toVegetationFallbackRow(r)))
      : (useDbYear ? effectiveYearRows : localYearRows);
    const compareData: any[] = metric === "vegetation"
      ? (useDbCompare ? effectiveCompareRows.map(enrichVegetationRow) : localCompareRows.map((r: any) => toVegetationFallbackRow(r)))
      : (useDbCompare ? effectiveCompareRows : localCompareRows);

    const lstMap = new Map<number, any>();
    yearData.forEach((row) => lstMap.set(row.district_id, row));
    const compareMap = new Map<number, any>();
    compareData.forEach((row) => compareMap.set(row.district_id, row));

    let minValue = Infinity;
    let maxValue = -Infinity;
    let minDelta = Infinity;
    let maxDelta = -Infinity;

    const features = geojson.features.map((feature: any) => {
      const row = lstMap.get(feature.properties.id) || null;
      const compareRow = compareYear ? compareMap.get(feature.properties.id) : null;
      const currentValue = valueFor(row, metric);
      const compareValue = compareYear ? valueFor(compareRow, metric) : null;
      const delta = currentValue !== null && compareValue !== null ? currentValue - compareValue : null;
      const pollutionScoreDelta =
        typeof row?.pollution_score === "number" && typeof compareRow?.pollution_score === "number"
          ? row.pollution_score - compareRow.pollution_score
          : null;
      const metricDelta = (field: string) =>
        typeof row?.[field] === "number" && typeof compareRow?.[field] === "number"
          ? row[field] - compareRow[field]
          : null;
      if (currentValue !== null) {
        minValue = Math.min(minValue, currentValue);
        maxValue = Math.max(maxValue, currentValue);
      }
      if (delta !== null) {
        minDelta = Math.min(minDelta, delta);
        maxDelta = Math.max(maxDelta, delta);
      }

      const ndviMean = metric === "vegetation" ? currentValue : null;
      const ndviScore = metric === "vegetation" ? (row?.ndvi_score ?? normalizeNdviScore(ndviMean)) : null;
      const districtAreaRai = districtAreaRaiMap.get(feature.properties.id) ?? 0;
      const ndbiMeanVal = row?.ndbi_mean ?? null;
      const builtupAreaRai = typeof ndbiMeanVal === "number" && districtAreaRai > 0
        ? Math.round(Math.max(0, Math.min(1, (ndbiMeanVal + 0.2) / 0.6)) * districtAreaRai)
        : null;

      return {
        ...feature,
        properties: {
          ...feature.properties,
          mean_lst: row?.mean_lst ?? null,
          max_lst: row?.max_lst ?? null,
          ndbi_mean: ndbiMeanVal,
          ndbi_max: row?.ndbi_max ?? null,
          no2_mean: row?.no2_mean ?? null,
          no2_delta: metricDelta("no2_mean"),
          no2_max: row?.no2_max ?? null,
          co_mean: row?.co_mean ?? null,
          co_delta: metricDelta("co_mean"),
          co_max: row?.co_max ?? null,
          so2_mean: row?.so2_mean ?? null,
          so2_delta: metricDelta("so2_mean"),
          so2_max: row?.so2_max ?? null,
          aerosol_index_mean: row?.aerosol_index_mean ?? null,
          aerosol_index_delta: metricDelta("aerosol_index_mean"),
          aerosol_index_max: row?.aerosol_index_max ?? null,
          pollution_score: row?.pollution_score ?? null,
          pollution_score_delta: pollutionScoreDelta,
          pollution_class: row?.pollution_class ?? null,
          air_quality_source: row?.air_quality_source ?? null,
          air_quality_note: row?.air_quality_note ?? null,
          district_area_rai: districtAreaRai || null,
          builtup_area_rai: builtupAreaRai,
          builtup_ratio: builtupAreaRai != null && districtAreaRai > 0
            ? builtupAreaRai / districtAreaRai : null,
          water_area_rai: row?.water_ratio != null && districtAreaRai > 0
            ? Math.round(row.water_ratio * districtAreaRai)
            : null,
          delta,
          vegetation_index: ndviMean,
          ndvi: ndviMean,
          ndvi_mean: ndviMean,
          ndvi_median: row?.ndvi_median ?? null,
          ndvi_min: row?.ndvi_min ?? null,
          ndvi_max: row?.ndvi_max ?? null,
          ndvi_score: ndviScore,
          ndvi_class: metric === "vegetation" ? (row?.ndvi_class || getNdviClass(ndviMean)) : null,
          green_area_ratio: row?.green_area_ratio ?? null,
          green_area_rai: row?.green_area_rai ?? null,
          low_green_ratio: row?.low_green_ratio ?? null,
          water_ratio: row?.water_ratio ?? null,
          ntl_mean: row?.ntl_mean ?? null,
          ntl_max: row?.ntl_max ?? null,
          priority_score: metric === "vegetation" && row ? calculatePriorityScore(row) : null,
          priority_reasons: metric === "vegetation" && row ? getPriorityReasons(row) : [],
          vegetation_delta: delta,
        },
      };
    });

    const hasAnyDbLst = effectiveAllRows.some((r) => typeof r.mean_lst === "number");
    const hasAnyDbNdbi = effectiveAllRows.some((r) => typeof r.ndbi_mean === "number");
    const hasAnyDbAir = hasAirPollutionData(effectiveAllRows);
    const summaryData: any[] = metric === "vegetation"
      ? (useDbAll ? effectiveAllRows.map(enrichVegetationRow) : lstData.map((r: any) => toVegetationFallbackRow(r)))
      : metric === "builtup"
        ? (hasAnyDbNdbi ? effectiveAllRows : [])
        : metric === "air_pollution"
          ? (hasAnyDbAir ? effectiveAllRows : [])
          : (hasAnyDbLst ? effectiveAllRows : lstData);
    const trendData = summaryData.reduce((acc: any, row: any) => {
      const trendValue = valueFor(row, metric);
      if (trendValue === null) return acc;
      if (!acc[row.year]) {
        acc[row.year] = {
          sum: 0,
          count: 0,
          weightedSum: 0,
          totalWeight: 0,
          max: -Infinity,
          ndviMin: Infinity,
          ndviMax: -Infinity,
          monthlyData: new Array(12).fill(0),
          monthlyCount: new Array(12).fill(0),
        };
      }
      acc[row.year].sum += trendValue;
      acc[row.year].count += 1;
      if (metric === "vegetation") {
        const areaWeight = districtAreaRaiMap.get(row.district_id) ?? 0;
        acc[row.year].weightedSum += trendValue * areaWeight;
        acc[row.year].totalWeight += areaWeight;
      }
      const maxTrendValue = metric === "lst" && typeof row.max_lst === "number" ? row.max_lst : trendValue;
      acc[row.year].max = Math.max(acc[row.year].max, maxTrendValue);
      if (metric === "vegetation") {
        if (typeof row.ndvi_min === "number") acc[row.year].ndviMin = Math.min(acc[row.year].ndviMin, row.ndvi_min);
        if (typeof row.ndvi_max === "number") acc[row.year].ndviMax = Math.max(acc[row.year].ndviMax, row.ndvi_max);
      }
      if (metric === "lst") {
        let monthlyLst = row.monthly_lst;
        if (!monthlyLst || monthlyLst.length === 0) {
          const fallbackRow = lstData.find((r: any) => r.district_id === row.district_id && r.year === row.year);
          if (fallbackRow && fallbackRow.monthly_lst) {
            monthlyLst = fallbackRow.monthly_lst;
          }
        }
        if (monthlyLst) {
          monthlyLst.forEach((temp: number, idx: number) => {
            acc[row.year].monthlyData[idx] += temp;
            acc[row.year].monthlyCount[idx] += 1;
          });
        }
      }
      return acc;
    }, {});

    const yearlyTrend = Object.keys(trendData).sort().map((trendYear) => {
      const isIndexMetric = metric === "vegetation" || metric === "builtup" || metric === "air_pollution";
      const aggregate = trendData[trendYear];
      const mean = metric === "vegetation" && aggregate.totalWeight > 0
        ? aggregate.weightedSum / aggregate.totalWeight
        : aggregate.sum / aggregate.count;
      const avg = parseFloat(mean.toFixed(isIndexMetric ? 6 : 2));
      let maxMonthIdx = -1;
      let maxMonthTemp = -Infinity;
      trendData[trendYear].monthlyData.forEach((sum: number, idx: number) => {
        if (trendData[trendYear].monthlyCount[idx] > 0) {
          const monthAvg = sum / trendData[trendYear].monthlyCount[idx];
          if (monthAvg > maxMonthTemp) {
            maxMonthTemp = monthAvg;
            maxMonthIdx = idx;
          }
        }
      });
      return [trendYear, avg, maxMonthIdx];
    });
    const yearlyMaxTrend = metric === "lst"
      ? Object.keys(trendData).sort().map((trendYear) => [
          trendYear,
          parseFloat((trendData[trendYear].max > -Infinity ? trendData[trendYear].max : trendData[trendYear].sum / trendData[trendYear].count).toFixed(2)),
          -1,
        ])
      : [];
    const yearlyRangeTrend = metric === "vegetation"
      ? yearlyTrend.map(([trendYear, mean]) => {
          const aggregate = trendData[trendYear];
          return [
            trendYear,
            mean,
            aggregate.ndviMin < Infinity ? parseFloat(aggregate.ndviMin.toFixed(6)) : null,
            aggregate.ndviMax > -Infinity ? parseFloat(aggregate.ndviMax.toFixed(6)) : null,
          ];
        })
      : [];
    const greenAreaTrend = metric === "vegetation"
      ? Object.entries(summaryData.reduce((acc: any, row: any) => {
          const greenAreaRai = typeof row.green_area_rai === "number" ? row.green_area_rai : null;
          if (greenAreaRai === null || row.year === null || row.year === undefined) return acc;
          acc[row.year] = (acc[row.year] || 0) + greenAreaRai;
          return acc;
        }, {}))
          .sort(([yearA], [yearB]) => Number(yearA) - Number(yearB))
          .map(([trendYear, totalRai]) => [trendYear, Math.round(Number(totalRai))])
      : [];

    const builtupAreaTrend = metric === "builtup"
      ? Object.entries(summaryData.reduce((acc: any, row: any) => {
          const ndbi = typeof row.ndbi_mean === "number" ? row.ndbi_mean : null;
          if (ndbi === null || row.year == null) return acc;
          const areaRai = districtAreaRaiMap.get(row.district_id) ?? 0;
          const builtupRai = Math.round(Math.max(0, Math.min(1, (ndbi + 0.2) / 0.6)) * areaRai);
          acc[row.year] = (acc[row.year] || 0) + builtupRai;
          return acc;
        }, {}))
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([trendYear, totalRai]) => [trendYear, Math.round(Number(totalRai))])
      : [];

    const yearlyAverageMap = new Map<number, number>(yearlyTrend.map(([trendYear, avg]) => [Number(trendYear), Number(avg)]));
    const baselineTrendAvg = compareYear ? yearlyAverageMap.get(compareYear) : null;
    const yearlyDeltaTrend = compareYear && baselineTrendAvg !== null && baselineTrendAvg !== undefined
      ? yearlyTrend.map(([trendYear, avg, maxMonthIdx]) => [
          trendYear,
          parseFloat((Number(avg) - baselineTrendAvg).toFixed((metric === "vegetation" || metric === "builtup" || metric === "air_pollution") ? 6 : 2)),
          maxMonthIdx,
        ])
      : [];

    const pollutionScoreTrend = metric === "air_pollution"
      ? Object.entries(summaryData.reduce((acc: any, row: any) => {
          if (typeof row.pollution_score !== "number" || row.year == null) return acc;
          if (!acc[row.year]) acc[row.year] = { sum: 0, count: 0 };
          acc[row.year].sum += row.pollution_score;
          acc[row.year].count += 1;
          return acc;
        }, {}))
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([trendYear, aggregate]: [string, any]) => [
            trendYear,
            parseFloat((aggregate.sum / aggregate.count).toFixed(3)),
          ])
      : [];
    const pollutionScoreAverageMap = new Map<number, number>(
      pollutionScoreTrend.map(([trendYear, avg]) => [Number(trendYear), Number(avg)])
    );
    const baselinePollutionScore = compareYear ? pollutionScoreAverageMap.get(compareYear) : null;
    const pollutionScoreDeltaTrend = compareYear && baselinePollutionScore != null
      ? pollutionScoreTrend.map(([trendYear, avg]) => [
          trendYear,
          parseFloat((Number(avg) - baselinePollutionScore).toFixed(3)),
        ])
      : [];

    const currentYearData = summaryData.filter((row: any) => row.year === year);
    const pollutionScoreRanking = metric === "air_pollution"
      ? currentYearData
          .filter((row: any) => typeof row.pollution_score === "number")
          .map((row: any) => [row.district_name, Number(row.pollution_score.toFixed(2))])
          .sort((a: any, b: any) => b[1] - a[1])
      : [];
    const pollutionScoreDeltaRanking = metric === "air_pollution" && compareYear
      ? (() => {
          const baselineRows = summaryData.filter((row: any) => row.year === compareYear);
          const baselineByDistrict = new Map(
            baselineRows.map((row: any) => [row.district_id, row.pollution_score])
          );
          return currentYearData
            .filter((row: any) =>
              typeof row.pollution_score === "number" &&
              typeof baselineByDistrict.get(row.district_id) === "number"
            )
            .map((row: any) => [
              row.district_name,
              parseFloat((row.pollution_score - Number(baselineByDistrict.get(row.district_id))).toFixed(2)),
            ])
            .sort((a: any, b: any) => b[1] - a[1]);
        })()
      : [];
    let ranking: any[] = [];
    let ndbiRanking: any[] = [];
    let areaRanking: any[] = [];
    let densityRanking: any[] = [];
    let maxRanking: any[] = [];
    let currentAvg = 0;
    let maxCurrentValue = -Infinity;
    let baselineAvg = 0;
    let maxIncreaseDelta = 0;
    let minIncreaseDelta = 0;
    let encroachmentRanking: any[] = [];

    if (currentYearData.length > 0) {
      const weightedMetricMean = (data: any[]) => {
        if (metric !== "vegetation") {
          return data.reduce((sum: number, row: any) => sum + (valueFor(row, metric) || 0), 0) / data.length;
        }
        const aggregate = data.reduce((acc: { sum: number; weight: number }, row: any) => {
          const value = valueFor(row, metric);
          const weight = districtAreaRaiMap.get(row.district_id) ?? 0;
          if (value !== null && weight > 0) {
            acc.sum += value * weight;
            acc.weight += weight;
          }
          return acc;
        }, { sum: 0, weight: 0 });
        return aggregate.weight > 0 ? aggregate.sum / aggregate.weight : 0;
      };

      currentAvg = weightedMetricMean(currentYearData);
      maxCurrentValue = currentYearData.reduce((max: number, row: any) => Math.max(max, valueFor(row, metric) ?? -Infinity), -Infinity);

      if (compareYear) {
        const compYearData = summaryData.filter((row: any) => row.year === compareYear);
        baselineAvg = compYearData.length > 0
          ? weightedMetricMean(compYearData)
          : 0;
        const compMap = new Map(compYearData.map((row: any) => [row.district_id, row]));
        ranking = currentYearData
          .map((row: any) => {
            const baselineRow = compMap.get(row.district_id);
            const current = valueFor(row, metric);
            const baselineVal = baselineRow ? valueFor(baselineRow, metric) : null;
            return { name: row.district_name, delta: baselineVal !== null && current !== null ? current - Number(baselineVal) : 0 };
          })
          .sort((a: any, b: any) => b.delta - a.delta)
          .map((row: any) => [row.name, row.delta]);
        if (ranking.length > 0) {
          maxIncreaseDelta = Math.max(...ranking.map(([, deltaValue]) => deltaValue));
          minIncreaseDelta = Math.min(...ranking.map(([, deltaValue]) => deltaValue));
        }

        if (metric === "builtup") {
          areaRanking = currentYearData
            .map((row: any) => {
              const baselineRow = compMap.get(row.district_id);
              const ndbi = typeof row.ndbi_mean === "number" ? row.ndbi_mean : null;
              const baseNdbi = baselineRow && typeof baselineRow.ndbi_mean === "number" ? baselineRow.ndbi_mean : null;
              const distRai = districtAreaRaiMap.get(row.district_id) ?? 0;
              const currAreaRai = ndbi !== null ? Math.round(Math.max(0, Math.min(1, (ndbi + 0.2) / 0.6)) * distRai) : 0;
              const baseAreaRai = baseNdbi !== null ? Math.round(Math.max(0, Math.min(1, (baseNdbi + 0.2) / 0.6)) * distRai) : 0;
              return [row.district_name, currAreaRai - baseAreaRai];
            })
            .sort((a: any, b: any) => (b[1] ?? 0) - (a[1] ?? 0));

          encroachmentRanking = currentYearData
            .map((row: any) => {
              const baselineRow = compMap.get(row.district_id);
              if (!baselineRow) return null;
              
              const currentNdbi = typeof row.ndbi_mean === "number" ? row.ndbi_mean : null;
              const baseNdbi = typeof baselineRow.ndbi_mean === "number" ? baselineRow.ndbi_mean : null;
              const currentNdvi = typeof row.ndvi_mean === "number" ? row.ndvi_mean : null;
              const baseNdvi = typeof baselineRow.ndvi_mean === "number" ? baselineRow.ndvi_mean : null;
              
              if (currentNdbi !== null && baseNdbi !== null && currentNdvi !== null && baseNdbi !== null) {
                const ndbiDelta = currentNdbi - baseNdbi;
                const ndviDelta = currentNdvi - baseNdvi;
                
                if (ndbiDelta > 0 && ndviDelta < 0) {
                  const score = ndbiDelta + Math.abs(ndviDelta);
                  return {
                    district_name: row.district_name,
                    ndbiDelta: parseFloat(ndbiDelta.toFixed(3)),
                    ndviDelta: parseFloat(ndviDelta.toFixed(3)),
                    score: parseFloat(score.toFixed(3))
                  };
                }
              }
              return null;
            })
            .filter((r: any) => r !== null)
            .sort((a: any, b: any) => b.score - a.score)
            .slice(0, 5);
        }
      } else {
        if (metric === "builtup") {
          ranking = currentYearData
            .map((row: any) => {
              const ndbi = typeof row.ndbi_mean === "number" ? row.ndbi_mean : null;
              const areaRai = districtAreaRaiMap.get(row.district_id) ?? 0;
              const builtupRai = ndbi !== null ? Math.round(Math.max(0, Math.min(1, (ndbi + 0.2) / 0.6)) * areaRai) : 0;
              return [row.district_name, builtupRai];
            })
            .sort((a: any, b: any) => (b[1] ?? 0) - (a[1] ?? 0));
          ndbiRanking = currentYearData
            .filter((row: any) => typeof row.ndbi_mean === "number")
            .map((row: any) => [row.district_name, parseFloat(row.ndbi_mean.toFixed(3))])
            .sort((a: any, b: any) => (b[1] ?? -Infinity) - (a[1] ?? -Infinity));
          // density = built-up area as % of total district area
          densityRanking = currentYearData
            .map((row: any) => {
              const ndbi = typeof row.ndbi_mean === "number" ? row.ndbi_mean : null;
              const areaRai = districtAreaRaiMap.get(row.district_id) ?? 0;
              const builtupRai = ndbi !== null ? Math.round(Math.max(0, Math.min(1, (ndbi + 0.2) / 0.6)) * areaRai) : 0;
              const pct = areaRai > 0 ? parseFloat(((builtupRai / areaRai) * 100).toFixed(1)) : 0;
              return [row.district_name, pct];
            })
            .sort((a: any, b: any) => (b[1] ?? 0) - (a[1] ?? 0));
        } else if (metric === "air_pollution") {
          ranking = currentYearData
            .sort((a: any, b: any) => (valueFor(b, metric) ?? -Infinity) - (valueFor(a, metric) ?? -Infinity))
            .map((row: any) => [row.district_name, valueFor(row, metric), row.pollution_score ?? null]);
          densityRanking = currentYearData
            .filter((row: any) => typeof row.pollution_score === "number")
            .map((row: any) => [row.district_name, Number(row.pollution_score.toFixed(2))])
            .sort((a: any, b: any) => (b[1] ?? 0) - (a[1] ?? 0));
        } else {
        ranking = currentYearData
          .sort((a: any, b: any) => (valueFor(b, metric) ?? -Infinity) - (valueFor(a, metric) ?? -Infinity))
          .map((row: any) => [row.district_name, valueFor(row, metric)]);
        }

        if (metric === "lst") {
          maxRanking = currentYearData
            .map((row: any) => [
              row.district_name,
              typeof row.max_lst === "number" ? row.max_lst : valueFor(row, metric),
            ])
            .sort((a: any, b: any) => (b[1] ?? -Infinity) - (a[1] ?? -Infinity));
        }

        if (metric === "vegetation") {
          // density = green area as % of total district area (ratio field)
          densityRanking = currentYearData
            .map((row: any) => {
              const ratio = typeof row.green_area_ratio === "number" ? row.green_area_ratio : null;
              const pct = ratio !== null ? parseFloat((ratio * 100).toFixed(1)) : 0;
              return [row.district_name, pct];
            })
            .sort((a: any, b: any) => (b[1] ?? 0) - (a[1] ?? 0));
        }
      }
    }

    const monthlyData = new Array(12).fill(0);
    const monthlyCounts = new Array(12).fill(0);
    const monthlyMaxData = new Array(12).fill(-Infinity);
    currentYearData.forEach((row: any) => {
      if (metric === "lst") {
        let monthlyLst = row.monthly_lst;
        if (!monthlyLst || monthlyLst.length === 0) {
          const fallbackRow = lstData.find((r: any) => r.district_id === row.district_id && r.year === row.year);
          if (fallbackRow && fallbackRow.monthly_lst) {
            monthlyLst = fallbackRow.monthly_lst;
          }
        }
        if (monthlyLst) {
          monthlyLst.forEach((temp: number, monthIdx: number) => {
            monthlyData[monthIdx] += temp;
            monthlyCounts[monthIdx] += 1;
            if (typeof temp === "number" && Number.isFinite(temp)) {
              monthlyMaxData[monthIdx] = Math.max(monthlyMaxData[monthIdx], temp);
            }
          });
        }
      }
    });
    const monthlyTrend = monthlyData.map((sum, idx) =>
      monthlyCounts[idx] > 0 ? parseFloat((sum / monthlyCounts[idx]).toFixed(2)) : 0,
    );
    const monthlyMaxTrend = metric === "lst"
      ? monthlyMaxData.map((temp) => temp > -Infinity ? parseFloat(temp.toFixed(2)) : 0)
      : [];

    let baselineMonthlyTrend: number[] = [];
    const monthlyDeltaTrend = compareYear ? (() => {
      const baselineMonthlyData = new Array(12).fill(0);
      const baselineMonthlyCounts = new Array(12).fill(0);
      summaryData
        .filter((row: any) => row.year === compareYear)
        .forEach((row: any) => {
          let monthlyLst = row.monthly_lst;
          if (!monthlyLst || monthlyLst.length === 0) {
            const fallbackRow = lstData.find((r: any) => r.district_id === row.district_id && r.year === row.year);
            if (fallbackRow && fallbackRow.monthly_lst) {
              monthlyLst = fallbackRow.monthly_lst;
            }
          }
          if (monthlyLst) {
            monthlyLst.forEach((temp: number, monthIdx: number) => {
              baselineMonthlyData[monthIdx] += temp;
              baselineMonthlyCounts[monthIdx] += 1;
            });
          }
        });

      baselineMonthlyTrend = baselineMonthlyData.map((sum, idx) =>
        baselineMonthlyCounts[idx] > 0 ? parseFloat((sum / baselineMonthlyCounts[idx]).toFixed(2)) : 0,
      );

      return monthlyTrend.map((temp, idx) => {
        if (monthlyCounts[idx] === 0 || baselineMonthlyCounts[idx] === 0) return 0;
        return parseFloat((temp - baselineMonthlyTrend[idx]).toFixed(2));
      });
    })() : [];

    const ndviSummary = metric === "vegetation"
      ? getBangkokNdviSummaryFromRows(currentYearData as DistrictStatistic[], year)
      : null;
    const lowestNdviRanking = metric === "vegetation"
      ? [...currentYearData]
          .sort((a: any, b: any) => (valueFor(a, metric) ?? 1) - (valueFor(b, metric) ?? 1))
          .slice(0, 10)
          .map((row: any) => ({
            district_id: row.district_id,
            district_name: row.district_name,
            ndvi_mean: valueFor(row, metric),
            ndvi_score: row.ndvi_score ?? normalizeNdviScore(valueFor(row, metric)),
            green_area_ratio: row.green_area_ratio ?? null,
            green_area_rai: row.green_area_rai ?? null,
            priority_score: calculatePriorityScore(row),
            reasons: getPriorityReasons(row),
          }))
      : [];
    const priorityRanking = metric === "vegetation"
      ? [...currentYearData]
          .sort((a: any, b: any) => calculatePriorityScore(b) - calculatePriorityScore(a))
          .slice(0, 10)
          .map((row: any) => ({
            district_id: row.district_id,
            district_name: row.district_name,
            priority_score: calculatePriorityScore(row),
            ndvi_mean: valueFor(row, metric),
            green_area_ratio: row.green_area_ratio ?? null,
            low_green_ratio: row.low_green_ratio ?? null,
            ntl_mean: row.ntl_mean ?? null,
            reasons: getPriorityReasons(row),
          }))
      : [];
    const provenance = metricProvenance(metric, yearData, useDbYear, airDataSource);

    return NextResponse.json({
      geojson: { type: "FeatureCollection", features },
      invertedMask,
      summary: {
        metric,
        selectedYear: year,
        compareYear,
        averageTemp: parseFloat(currentAvg.toFixed((metric === "vegetation" || metric === "builtup") ? 3 : metric === "air_pollution" ? 6 : 2)),
        baselineAverageTemp: baselineAvg ? parseFloat(baselineAvg.toFixed((metric === "vegetation" || metric === "builtup") ? 3 : metric === "air_pollution" ? 6 : 2)) : null,
        avgDelta: compareYear && baselineAvg ? parseFloat((currentAvg - baselineAvg).toFixed((metric === "vegetation" || metric === "builtup") ? 3 : metric === "air_pollution" ? 6 : 2)) : 0,
        maxTemp: maxCurrentValue > -Infinity ? parseFloat(maxCurrentValue.toFixed((metric === "vegetation" || metric === "builtup") ? 3 : metric === "air_pollution" ? 6 : 2)) : null,
        
        // Generic value aliases
        averageValue: parseFloat(currentAvg.toFixed((metric === "vegetation" || metric === "builtup") ? 3 : metric === "air_pollution" ? 6 : 2)),
        baselineAverageValue: baselineAvg ? parseFloat(baselineAvg.toFixed((metric === "vegetation" || metric === "builtup") ? 3 : metric === "air_pollution" ? 6 : 2)) : null,
        maxValue: maxCurrentValue > -Infinity ? parseFloat(maxCurrentValue.toFixed((metric === "vegetation" || metric === "builtup") ? 3 : metric === "air_pollution" ? 6 : 2)) : null,
        minValue: minValue !== Infinity ? minValue : null,
        valueDelta: compareYear && baselineAvg ? parseFloat((currentAvg - baselineAvg).toFixed((metric === "vegetation" || metric === "builtup") ? 3 : metric === "air_pollution" ? 6 : 2)) : 0,
        
        // Metric-specific aliases
        ...(metric === "vegetation" ? {
          averageNdvi: parseFloat(currentAvg.toFixed(3)),
          baselineAverageNdvi: baselineAvg ? parseFloat(baselineAvg.toFixed(3)) : null,
          maxNdvi: maxCurrentValue > -Infinity ? parseFloat(maxCurrentValue.toFixed(3)) : null,
          minNdvi: minValue !== Infinity ? minValue : null,
        } : {}),
        ...(metric === "builtup" ? {
          averageNdbi: parseFloat(currentAvg.toFixed(3)),
          baselineAverageNdbi: baselineAvg ? parseFloat(baselineAvg.toFixed(3)) : null,
          maxNdbi: maxCurrentValue > -Infinity ? parseFloat(maxCurrentValue.toFixed(3)) : null,
          minNdbi: minValue !== Infinity ? minValue : null,
        } : {}),
        ...(metric === "air_pollution" ? {
          averagePollutionScore: parseFloat(currentAvg.toFixed(6)),
          baselineAveragePollutionScore: baselineAvg ? parseFloat(baselineAvg.toFixed(6)) : null,
          maxPollutionScore: maxCurrentValue > -Infinity ? parseFloat(maxCurrentValue.toFixed(6)) : null,
          minPollutionScore: minValue !== Infinity ? minValue : null,
        } : {}),
        yearlyTrend,
        yearlyRangeTrend,
        yearlyMaxTrend,
        greenAreaTrend,
        builtupAreaTrend,
        yearlyDeltaTrend,
        pollutionScoreTrend,
        pollutionScoreDeltaTrend,
        pollutionScoreRanking,
        pollutionScoreDeltaRanking,
        monthlyTrend,
        monthlyMaxTrend,
        baselineMonthlyTrend,
        monthlyDeltaTrend,
        ranking,
        ndbiRanking,
        areaRanking,
        densityRanking,
        maxRanking,
        min_lst: minValue !== Infinity ? minValue : metric === "vegetation" ? 0 : metric === "builtup" ? -0.2 : metric === "air_pollution" ? 0 : 30,
        max_lst: maxValue !== -Infinity ? maxValue : metric === "vegetation" ? 0.8 : metric === "builtup" ? 0.4 : metric === "air_pollution" ? 0.0003 : 40,
        min_delta: minDelta !== Infinity ? minDelta : metric === "vegetation" ? -0.2 : metric === "builtup" ? -0.2 : metric === "air_pollution" ? -0.00015 : -2,
        max_delta: maxDelta !== -Infinity ? maxDelta : metric === "vegetation" ? 0.2 : metric === "builtup" ? 0.2 : metric === "air_pollution" ? 0.00015 : 2,
        maxIncreaseDelta: parseFloat(maxIncreaseDelta.toFixed((metric === "vegetation" || metric === "builtup") ? 3 : metric === "air_pollution" ? 6 : 2)),
        minIncreaseDelta: parseFloat(minIncreaseDelta.toFixed((metric === "vegetation" || metric === "builtup") ? 3 : metric === "air_pollution" ? 6 : 2)),
        ndviSummary,
        lowestNdviRanking,
        priorityRanking,
        encroachmentRanking,
        ...provenance,
      },
    }, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
      },
    });
  } catch (error: any) {
    console.error("LST API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
