/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { BigQuery } from "@google-cloud/bigquery";
import * as turf from "@turf/turf";
import geojson from "@/data/bkk_districts.json";
import ee, { initGEE } from "@/lib/gee";
import { supabaseServer as supabase } from "@/lib/supabase/server";
import {
  combineComponents,
  minMaxNormalize,
  type DecisionMode,
  type ScoreComponent,
} from "@/lib/decision-support";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const districtByName = new Map(
  (geojson.features as any[]).map((feature) => [feature.properties.name_th, feature]),
);
const districtAreaSqKm = new Map(
  (geojson.features as any[]).map((feature) => [
    feature.properties.name_th,
    turf.area(feature) / 1_000_000,
  ]),
);

function evaluateEe<T>(object: any): Promise<T> {
  return new Promise((resolve, reject) => {
    object.evaluate((value: T, error: any) => error ? reject(error) : resolve(value));
  });
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("GEE decision-support timeout")), milliseconds),
    ),
  ]);
}

function districtCollection() {
  return ee.FeatureCollection(
    (geojson.features as any[]).map((feature) =>
      ee.Feature(ee.Geometry(feature.geometry).simplify(200), {
        district_id: feature.properties.id,
        district_name: feature.properties.name_th,
      }),
    ),
  );
}

function maskSentinel2(image: any) {
  const scl = image.select("SCL");
  const clear = scl.neq(0).and(scl.neq(1)).and(scl.neq(3))
    .and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10)).and(scl.neq(11));
  return image.updateMask(clear);
}

function periodFor(year: number) {
  const now = new Date();
  const end = year === now.getUTCFullYear()
    ? now
    : new Date(Date.UTC(year, 11, 31));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 30);
  const baselineStart = new Date(start);
  baselineStart.setUTCDate(baselineStart.getUTCDate() - 90);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  return {
    start: iso(start),
    end: iso(new Date(end.getTime() + 86400000)),
    baselineStart: iso(baselineStart),
    label: `${iso(start)} ถึง ${iso(end)}`,
  };
}

async function computeFloodGee(year: number) {
  await initGEE();
  const period = periodFor(year);
  const bounds = ee.Geometry.BBox(100.329, 13.494, 100.935, 13.956);

  const rainfall = ee.ImageCollection("NASA/GPM_L3/IMERG_V07")
    .filterBounds(bounds)
    .filterDate(period.start, period.end)
    .select("precipitation")
    .sum()
    .rename("rainfall");

  const sentinel1 = (start: string, end: string) => ee.ImageCollection("COPERNICUS/S1_GRD")
    .filterBounds(bounds)
    .filterDate(start, end)
    .filter(ee.Filter.eq("instrumentMode", "IW"))
    .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
    .select("VV")
    .median();
  const recentSar = sentinel1(period.start, period.end);
  const baselineSar = sentinel1(period.baselineStart, period.start);
  const sarWetness = baselineSar.subtract(recentSar).rename("sar_wetness");

  const sentinel2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(bounds)
    .filterDate(period.start, period.end)
    .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 40))
    .map(maskSentinel2)
    .map((image: any) => image.addBands(
      image.normalizedDifference(["B3", "B8"]).rename("NDWI"),
    ));
  const ndwi = sentinel2.select("NDWI").median().rename("ndwi");
  const permanentWater = ee.Image("JRC/GSW1_4/GlobalSurfaceWater")
    .select("occurrence").gte(70);
  const seasonalWater = ndwi.gt(0.05).and(permanentWater.not()).rename("water_signal");
  const elevation = ee.Image("USGS/SRTMGL1_003").select("elevation").rename("elevation");

  const stack = rainfall.addBands(sarWetness).addBands(ndwi)
    .addBands(seasonalWater).addBands(elevation);
  const result = await evaluateEe<any>(stack.reduceRegions({
    collection: districtCollection(),
    reducer: ee.Reducer.mean(),
    scale: 250,
    tileScale: 4,
  }));

  return {
    period,
    rows: (result?.features ?? []).map((feature: any) => {
      const properties = feature.properties ?? {};
      const numberOrNull = (value: unknown) =>
        typeof value === "number" && Number.isFinite(value) ? value : null;
      return {
        district_id: properties.district_id,
        district_name: properties.district_name,
        rainfall: numberOrNull(properties.rainfall),
        sar_wetness: numberOrNull(properties.sar_wetness),
        ndwi: numberOrNull(properties.ndwi),
        water_signal: numberOrNull(properties.water_signal),
        elevation: numberOrNull(properties.elevation),
      };
    }),
  };
}

async function loadDistrictRows(year: number) {
  const { data: districts } = await supabase.from("districts").select("id, name_th");
  const { data, error } = await supabase
    .from("district_statistics")
    .select("district_id, year, mean_lst, max_lst, ndvi_mean, green_area_ratio, ndbi_mean, water_ratio, ndvi_data_source, ndbi_data_source")
    .eq("year", year);
  if (error) throw error;
  const nameById = new Map((districts ?? []).map((district: any) => [district.id, district.name_th]));
  return (data ?? []).map((row: any) => ({
    ...row,
    district_name: nameById.get(row.district_id) ?? null,
  })).filter((row: any) => districtByName.has(row.district_name));
}

function bigQueryClient() {
  if (!process.env.BQ_PROJECT_ID || !process.env.BQ_DATASET || !process.env.BQ_CREDENTIALS) {
    return null;
  }
  try {
    return new BigQuery({
      projectId: process.env.BQ_PROJECT_ID,
      credentials: JSON.parse(process.env.BQ_CREDENTIALS),
    });
  } catch {
    return null;
  }
}

async function loadFloodComplaints(year: number) {
  const client = bigQueryClient();
  if (!client) return { available: false, rows: [] as any[] };
  const table = `\`${process.env.BQ_PROJECT_ID}.${process.env.BQ_DATASET}.traffy_complaints\``;
  const query = `
    WITH deduped AS (
      SELECT * FROM ${table}
      QUALIFY ROW_NUMBER() OVER (
        PARTITION BY ticket_id ORDER BY COALESCE(ingested_at, created_at) DESC
      ) = 1
    )
    SELECT district, COUNT(*) AS total,
      COUNTIF(state IN ('รอรับเรื่อง', 'กำลังดำเนินการ', 'ส่งต่อ(ใหม่)', 'ส่งต่อ')) AS unresolved
    FROM deduped
    WHERE EXTRACT(YEAR FROM created_at AT TIME ZONE 'Asia/Bangkok') = @year
      AND (
        problem_type = 'น้ำท่วม/ระบายน้ำ'
        OR REGEXP_CONTAINS(IFNULL(description, ''), r'น้ำท่วม|น้ำขัง|น้ำรอระบาย|ระบายน้ำ|ท่อตัน|ฝาท่อ|บ่อพัก|คลอง')
      )
    GROUP BY district
  `;
  const [rows] = await client.query({
    query,
    params: { year },
    types: { year: "INT64" },
    location: "asia-southeast1",
  });
  return { available: true, rows };
}

function buildFeature(row: any) {
  const feature = districtByName.get(row.district_name) as any;
  return {
    ...feature,
    properties: {
      ...feature.properties,
      ...row,
    },
  };
}

async function floodResponse(year: number) {
  const [dbRows, complaintResult, geeResult] = await Promise.all([
    loadDistrictRows(year).catch(() => []),
    loadFloodComplaints(year).catch(() => ({ available: false, rows: [] })),
    withTimeout(computeFloodGee(year), 50000).catch(() => null),
  ]);
  const complaintByName = new Map(
    complaintResult.rows.map((row: any) => [row.district, row]),
  );
  const dbByName = new Map(dbRows.map((row: any) => [row.district_name, row]));
  const geeByName = new Map((geeResult?.rows ?? []).map((row: any) => [row.district_name, row]));

  const rawRows = (geojson.features as any[]).map((feature) => {
    const name = feature.properties.name_th;
    const geeRow: any = geeByName.get(name);
    const dbRow: any = dbByName.get(name);
    const complaint: any = complaintByName.get(name);
    const area = districtAreaSqKm.get(name) ?? null;
    return {
      district_id: feature.properties.id,
      district_name: name,
      rainfall: geeRow?.rainfall ?? null,
      sar_wetness: geeRow?.sar_wetness ?? null,
      water_signal: geeRow?.water_signal ?? dbRow?.water_ratio ?? null,
      elevation: geeRow?.elevation ?? null,
      complaint_density: complaint && area ? Number(complaint.total) / area : null,
      unresolved: complaint ? Number(complaint.unresolved) : null,
      complaint_total: complaint ? Number(complaint.total) : null,
    };
  });

  const fields = {
    rainfall: rawRows.map((row) => row.rainfall),
    sar: rawRows.map((row) => row.sar_wetness),
    water: rawRows.map((row) => row.water_signal),
    elevation: rawRows.map((row) => row.elevation),
    complaints: rawRows.map((row) => row.complaint_density),
  };
  const rows = rawRows.map((row) => {
    const components: ScoreComponent[] = [
      { key: "rainfall", label: "ฝนสะสม 30 วัน", value: row.rainfall, normalized: minMaxNormalize(row.rainfall, fields.rainfall), weight: 25, source: "GPM IMERG V07" },
      { key: "sar", label: "การเปลี่ยนแปลงสัญญาณเรดาร์", value: row.sar_wetness, normalized: minMaxNormalize(row.sar_wetness, fields.sar), weight: 20, source: "Sentinel-1 GRD" },
      { key: "water", label: "สัญญาณน้ำชั่วคราว", value: row.water_signal, normalized: minMaxNormalize(row.water_signal, fields.water), weight: 25, source: geeResult ? "Sentinel-2 + JRC" : "district_statistics" },
      { key: "elevation", label: "พื้นที่ต่ำ", value: row.elevation, normalized: minMaxNormalize(row.elevation, fields.elevation, true), weight: 15, source: "SRTM DEM" },
      { key: "complaints", label: "เหตุร้องเรียนต่อพื้นที่", value: row.complaint_density, normalized: minMaxNormalize(row.complaint_density, fields.complaints), weight: 15, source: "Traffy Fondue" },
    ];
    return { ...row, ...combineComponents(components, 5) };
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  return {
    mode: "flood" as DecisionMode,
    title: "ลำดับความสำคัญรับมือน้ำท่วม",
    period: geeResult?.period.label ?? `ปี ${year}`,
    rows,
    geojson: { type: "FeatureCollection", features: rows.map(buildFeature) },
    methodology: "คะแนนคัดกรองเชิงปฏิบัติการ 0-100 เปรียบเทียบสัมพัทธ์ระหว่าง 50 เขต และปรับน้ำหนักใหม่เมื่อข้อมูลบางแหล่งขาด",
    limitations: [
      "ไม่ใช่แบบจำลองชลศาสตร์หรือการพยากรณ์ระดับน้ำ",
      "ควรเพิ่มโครงข่ายท่อ คลอง ความจุสถานีสูบน้ำ และระดับถนนเพื่อใช้สั่งการภาคสนาม",
      complaintResult.available ? "Traffy สะท้อนจุดที่ประชาชนรายงาน จึงมีอคติด้านการเข้าถึงและการรายงาน" : "ไม่มี Traffy ในรอบนี้ คะแนนจึงไม่รวมหลักฐานภาคประชาชน",
    ],
  };
}

async function heatResponse(year: number) {
  const dbRows = await loadDistrictRows(year);
  const rawRows = dbRows.map((row: any) => ({
    district_id: (districtByName.get(row.district_name) as any)?.properties?.id,
    district_name: row.district_name,
    mean_lst: typeof row.mean_lst === "number" ? row.mean_lst : null,
    max_lst: typeof row.max_lst === "number" ? row.max_lst : null,
    green_deficit: typeof row.green_area_ratio === "number"
      ? 1 - row.green_area_ratio
      : typeof row.ndvi_mean === "number" ? 1 - Math.max(0, Math.min(1, row.ndvi_mean)) : null,
    builtup: typeof row.ndbi_mean === "number" ? row.ndbi_mean : null,
    // Population fields in the legacy pipeline were generated proxies without
    // authoritative provenance. Keep them out until an official source is joined.
    density: null,
    population: null,
    sources: {
      lst: "district_statistics (ไม่ระบุ provenance รายแถว)",
      green: row.ndvi_data_source ?? "district_statistics",
      builtup: row.ndbi_data_source ?? "district_statistics",
    },
  }));
  const fields = {
    lst: rawRows.map((row) => row.mean_lst),
    maxLst: rawRows.map((row) => row.max_lst),
    green: rawRows.map((row) => row.green_deficit),
    builtup: rawRows.map((row) => row.builtup),
    density: rawRows.map((row) => row.density),
  };
  const hasPopulationDensity = fields.density.some((value) => value !== null);
  const rows = rawRows.map((row) => {
    const components: ScoreComponent[] = [
      { key: "lst", label: "LST เฉลี่ย", value: row.mean_lst, normalized: minMaxNormalize(row.mean_lst, fields.lst), weight: 35, source: row.sources.lst },
      { key: "max_lst", label: "LST สูงสุด", value: row.max_lst, normalized: minMaxNormalize(row.max_lst, fields.maxLst), weight: 15, source: row.sources.lst },
      { key: "green", label: "การขาดพื้นที่สีเขียว", value: row.green_deficit, normalized: minMaxNormalize(row.green_deficit, fields.green), weight: 25, source: row.sources.green },
      { key: "builtup", label: "ความหนาแน่นสิ่งปลูกสร้าง", value: row.builtup, normalized: minMaxNormalize(row.builtup, fields.builtup), weight: 10, source: row.sources.builtup },
      { key: "density", label: "ความหนาแน่นประชากร", value: row.density, normalized: minMaxNormalize(row.density, fields.density), weight: 15, source: "district_statistics" },
    ];
    const result = combineComponents(components, 5);
    return {
      ...row,
      ...result,
      confidence: hasPopulationDensity ? result.confidence : "ปานกลาง",
    };
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  return {
    mode: "heat" as DecisionMode,
    title: "ความเปราะบางต่อความร้อน",
    period: `ปี ${year}`,
    rows,
    geojson: { type: "FeatureCollection", features: rows.map(buildFeature) },
    methodology: "คะแนนคัดกรอง 0-100 จากความร้อนพื้นผิว การขาดพื้นที่สีเขียว สิ่งปลูกสร้าง และประชากรเมื่อมีข้อมูล",
    limitations: [
      "LST คืออุณหภูมิพื้นผิว ไม่ใช่อุณหภูมิอากาศหรือค่าความสบายเชิงความร้อน",
      hasPopulationDensity
        ? "มีความหนาแน่นประชากร แต่ยังไม่มีผู้สูงอายุ เด็ก ผู้ป่วยติดเตียง รายได้ และการเข้าถึงพื้นที่เย็น"
        : "ยังไม่มีความหนาแน่นประชากร คะแนนรอบนี้จึงเป็นลำดับความร้อนเชิงกายภาพ ไม่ใช่ความเปราะบางทางสังคมเต็มรูปแบบ",
      "ควรเชื่อมทะเบียนกลุ่มเปราะบาง สถานพยาบาล ศูนย์พักร้อน และข้อมูลอุณหภูมิอากาศภาคพื้นดิน",
    ],
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode: DecisionMode = searchParams.get("mode") === "heat" ? "heat" : "flood";
    const year = Number.parseInt(searchParams.get("year") || "2024", 10);
    const payload = mode === "heat" ? await heatResponse(year) : await floodResponse(year);
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=300" },
    });
  } catch (error: any) {
    console.error("Decision support API error:", error);
    return NextResponse.json({ error: error?.message ?? "Unknown error" }, { status: 500 });
  }
}
